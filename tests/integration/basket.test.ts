import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { db, resetDatabase, seedSettings, seedLaunchCatalogue, makeProduct, makeCode } from './helpers'

/** Milestone B2 — server re-pricing. GUARD-1 lives here. */
describe('priceBasket (B2)', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedSettings()
    await seedLaunchCatalogue()
    const { invalidateSettings } = await import('@/lib/domain/settings')
    invalidateSettings()
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  async function price(
    lines: { sku: string; qty: number }[],
    code?: string | null,
    deliveryMethod: 'STANDARD' | 'EXPRESS' = 'STANDARD',
  ) {
    const { priceBasket } = await import('@/lib/domain/basket')
    return priceBasket({ lines, codeInput: code ?? null, deliveryMethod })
  }

  it('prices from the DATABASE: S$120 tank + S$10 standard = S$130', async () => {
    const { basket } = await price([{ sku: 'WHP-N2O-2500-1', qty: 1 }])
    expect(basket.subtotalCents).toBe(12000)
    expect(basket.deliveryFeeCents).toBe(1000)
    expect(basket.totalCents).toBe(13000)
  })

  it('charges the express rate when express is chosen', async () => {
    const { basket } = await price([{ sku: 'WHP-N2O-2500-1', qty: 1 }], null, 'EXPRESS')
    expect(basket.deliveryFeeCents).toBe(2000)
    expect(basket.totalCents).toBe(14000)
  })

  it('gives free delivery at S$200, at either speed', async () => {
    for (const method of ['STANDARD', 'EXPRESS'] as const) {
      const { basket } = await price([{ sku: 'WHP-N2O-2500-2', qty: 1 }], null, method)
      expect(basket.subtotalCents).toBe(22000)
      expect(basket.totalCents).toBe(22000)
      expect(basket.freeDeliveryApplied).toBe(true)
    }
  })

  it('reflects a price change made in the database with no deploy', async () => {
    await db.product.update({ where: { sku: 'WHP-N2O-640-1' }, data: { priceCents: 4500 } })
    const { basket } = await price([{ sku: 'WHP-N2O-640-1', qty: 2 }])
    expect(basket.subtotalCents).toBe(9000)
  })

  it('DROPS a product that has been disabled, and says why', async () => {
    await db.product.update({ where: { sku: 'WHP-EQ-MIXER' }, data: { isActive: false } })
    const { basket, issues } = await price([
      { sku: 'WHP-EQ-MIXER', qty: 1 },
      { sku: 'WHP-N2O-640-1', qty: 1 },
    ])
    expect(basket.lines.map((l) => l.sku)).toEqual(['WHP-N2O-640-1'])
    expect(issues[0]).toMatchObject({ sku: 'WHP-EQ-MIXER', kind: 'UNAVAILABLE' })
  })

  it('DROPS an unknown SKU invented by a tampered cart', async () => {
    const { basket, issues } = await price([{ sku: 'NOT-A-REAL-SKU', qty: 1 }])
    expect(basket.lines).toHaveLength(0)
    expect(issues[0]).toMatchObject({ kind: 'UNKNOWN' })
  })

  it('REDUCES a quantity that exceeds stock rather than failing checkout', async () => {
    await makeProduct({ sku: 'SCARCE', stockQty: 3, priceCents: 1000 })
    const { basket, issues } = await price([{ sku: 'SCARCE', qty: 10 }])
    expect(basket.lines[0]!.quantity).toBe(3)
    expect(basket.subtotalCents).toBe(3000)
    expect(issues[0]).toMatchObject({ kind: 'INSUFFICIENT_STOCK', availableQty: 3 })
  })

  it('DROPS an out-of-stock line', async () => {
    await makeProduct({ sku: 'GONE', stockQty: 0 })
    const { basket, issues } = await price([{ sku: 'GONE', qty: 1 }])
    expect(basket.lines).toHaveLength(0)
    expect(issues[0]).toMatchObject({ kind: 'INSUFFICIENT_STOCK', availableQty: 0 })
  })
})

/** Milestone B4 — discount validation against real rows. */
describe('discount codes end to end (B4)', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedSettings()
    await seedLaunchCatalogue()
    const { invalidateSettings } = await import('@/lib/domain/settings')
    invalidateSettings()
  })

  async function price(lines: { sku: string; qty: number }[], code?: string | null) {
    const { priceBasket } = await import('@/lib/domain/basket')
    return priceBasket({ lines, codeInput: code ?? null })
  }

  it('applies WELCOME10 case-insensitively', async () => {
    await makeCode({ code: 'WELCOME10', percentOff: 10 })
    const { basket, codeError } = await price([{ sku: 'WHP-N2O-2500-1', qty: 1 }], 'welcome10')
    expect(codeError).toBeNull()
    expect(basket.discountCents).toBe(1200)
    expect(basket.totalCents).toBe(12000 - 1200 + 1000)
  })

  it('refuses an expired code by name and date', async () => {
    await makeCode({ code: 'OLD10', expiresAt: new Date('2020-01-01') })
    const { basket, codeError } = await price([{ sku: 'WHP-N2O-2500-1', qty: 1 }], 'OLD10')
    expect(codeError).toMatch(/expired on 1 Jan 2020/)
    expect(basket.discountCents).toBe(0)
  })

  it('refuses a fully redeemed use-limited code on the sixth attempt', async () => {
    await makeCode({ code: 'FIVE', limitType: 'USE_LIMITED', maxUses: 5, usesCount: 5 })
    const { codeError } = await price([{ sku: 'WHP-N2O-2500-1', qty: 1 }], 'FIVE')
    expect(codeError).toMatch(/fully redeemed/)
  })

  it('applies a SEASONAL code inside its window and refuses it outside', async () => {
    await makeCode({
      code: 'XMAS26',
      limitType: 'SEASONAL',
      seasonLabel: 'Christmas 2026',
      percentOff: 10,
      startsAt: new Date(Date.now() - 24 * 3600 * 1000),
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    })
    const live = await price([{ sku: 'WHP-N2O-2500-1', qty: 1 }], 'XMAS26')
    expect(live.codeError).toBeNull()
    expect(live.basket.discountCents).toBe(1200)

    // The same row, once its season has passed — nobody disabled it.
    await db.discountCode.update({
      where: { code: 'XMAS26' },
      data: {
        startsAt: new Date(Date.now() - 48 * 3600 * 1000),
        expiresAt: new Date(Date.now() - 3600 * 1000),
      },
    })
    const closed = await price([{ sku: 'WHP-N2O-2500-1', qty: 1 }], 'XMAS26')
    expect(closed.codeError).toMatch(/Christmas 2026 ended/)
    expect(closed.basket.discountCents).toBe(0)
  })

  it('THE ORDERING DECISION: a discount that drops the basket below the threshold restores the fee', async () => {
    await makeCode({ code: 'TEN', percentOff: 10 })
    const before = await price([{ sku: 'WHP-N2O-2500-2', qty: 1 }])
    expect(before.basket.deliveryFeeCents).toBe(0)

    // S$220 less 10% is S$198 — below the S$200 threshold, so the fee returns.
    const after = await price([{ sku: 'WHP-N2O-2500-2', qty: 1 }], 'TEN')
    expect(after.basket.discountCents).toBe(2200)
    expect(after.basket.deliveryFeeCents).toBe(1000)
    expect(after.basket.totalCents).toBe(22000 - 2200 + 1000)
  })
})

/** Milestone B5 — redemption counting and referral attribution. */
describe('redemptions and referral attribution (B5)', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedSettings()
    await seedLaunchCatalogue()
  })

  async function makeOrder(totalCents: number) {
    return db.order.create({
      data: {
        reference: `WHP-TEST-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
        subtotalCents: totalCents,
        discountCents: 0,
        deliveryFeeCents: 0,
        totalCents,
        contactName: 'Test',
        contactEmail: 't@example.com',
        contactPhone: '+6591234567',
        addressLine1: '1 Test Road',
        postalCode: '123456',
        normalisedEmail: 't@example.com',
        normalisedPhone: '+6591234567',
      },
    })
  }

  it('counts a redemption and increments the code', async () => {
    const code = await makeCode({ code: 'JASON10', attributionLabel: 'Jason' })
    const order = await makeOrder(9000)
    const { countRedemption } = await import('@/lib/domain/redemptions')

    const outcome = await db.$transaction((tx) =>
      countRedemption(tx, {
        codeId: code.id,
        orderId: order.id,
        discountCents: 900,
        orderTotalCents: 9000,
      }),
    )

    expect(outcome.counted).toBe(true)
    const reloaded = await db.discountCode.findUniqueOrThrow({ where: { id: code.id } })
    expect(reloaded.usesCount).toBe(1)
  })

  it('TWO CONCURRENT REDEMPTIONS of a one-use code produce exactly one increment', async () => {
    const code = await makeCode({
      code: 'ONESHOT',
      limitType: 'USE_LIMITED',
      maxUses: 1,
      usesCount: 0,
    })
    const orderA = await makeOrder(9000)
    const orderB = await makeOrder(9000)
    const { countRedemption } = await import('@/lib/domain/redemptions')

    const [a, b] = await Promise.all([
      db.$transaction((tx) =>
        countRedemption(tx, {
          codeId: code.id,
          orderId: orderA.id,
          discountCents: 900,
          orderTotalCents: 9000,
        }),
      ),
      db.$transaction((tx) =>
        countRedemption(tx, {
          codeId: code.id,
          orderId: orderB.id,
          discountCents: 900,
          orderTotalCents: 9000,
        }),
      ),
    ])

    const reloaded = await db.discountCode.findUniqueOrThrow({ where: { id: code.id } })
    expect(reloaded.usesCount).toBe(1)
    expect([a.counted, b.counted].filter(Boolean)).toHaveLength(1)

    // Both orders were still honoured at the price they were quoted.
    expect(await db.discountRedemption.count()).toBe(2)
  })

  it('reports uses, sales generated and discount given per code, from ROWS not a counter', async () => {
    const code = await makeCode({ code: 'JASON10', attributionLabel: 'Jason' })
    const { countRedemption, codePerformance, referrerPerformance } = await import(
      '@/lib/domain/redemptions'
    )

    for (const total of [9000, 20000, 5500]) {
      const order = await makeOrder(total)
      await db.$transaction((tx) =>
        countRedemption(tx, {
          codeId: code.id,
          orderId: order.id,
          discountCents: Math.floor(total * 0.1),
          orderTotalCents: total,
        }),
      )
    }

    const perCode = await codePerformance()
    expect(perCode).toHaveLength(1)
    expect(perCode[0]).toMatchObject({
      code: 'JASON10',
      attributionLabel: 'Jason',
      redemptions: 3,
      salesGeneratedCents: 34500,
      discountGivenCents: 900 + 2000 + 550,
    })

    const perReferrer = await referrerPerformance()
    expect(perReferrer[0]).toMatchObject({ label: 'Jason', redemptions: 3, salesCents: 34500 })
  })
})
