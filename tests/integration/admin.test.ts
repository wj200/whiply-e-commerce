import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import {
  db,
  resetDatabase,
  seedSettings,
  seedLaunchCatalogue,
  makeCode,
  aValidSlot,
} from './helpers'

/** Milestones E1–E7 and F1–F2. */

describe('enquiry intake (F1)', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedSettings()
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it('stores a valid enquiry and normalises the phone number', async () => {
    const { createEnquiry } = await import('@/lib/domain/enquiries')
    const outcome = await createEnquiry({
      data: {
        name: 'Chef Tan',
        email: 'Chef@Kitchen.SG',
        phone: '9123 4567',
        message: 'Forty cylinders a month.',
      },
      sourcePage: '/bulk-orders',
    })

    expect(outcome.ok).toBe(true)
    const row = await db.enquiry.findFirstOrThrow()
    expect(row).toMatchObject({
      name: 'Chef Tan',
      phone: '+6591234567',
      status: 'NEW',
      sourcePage: '/bulk-orders',
    })
  })

  it('accepts an enquiry with no message — the point is to capture the lead', async () => {
    const { createEnquiry } = await import('@/lib/domain/enquiries')
    const outcome = await createEnquiry({
      data: { name: 'Chef Tan', email: 'chef@kitchen.sg', phone: '91234567', message: '' },
    })
    expect(outcome.ok).toBe(true)
    const row = await db.enquiry.findFirstOrThrow()
    expect(row.message).toBeNull()
  })

  it('refuses a non-Singapore mobile', async () => {
    const { createEnquiry } = await import('@/lib/domain/enquiries')
    const outcome = await createEnquiry({
      data: { name: 'Chef Tan', email: 'chef@kitchen.sg', phone: '61234567' },
    })
    expect(outcome).toMatchObject({ ok: false, reason: 'INVALID' })
    expect(await db.enquiry.count()).toBe(0)
  })

  it('counts NEW enquiries for the nav badge', async () => {
    const { createEnquiry, countNewEnquiries, listEnquiries } = await import(
      '@/lib/domain/enquiries'
    )
    for (const n of [1, 2, 3]) {
      await createEnquiry({
        data: { name: `Chef ${n}`, email: `chef${n}@kitchen.sg`, phone: '91234567' },
      })
    }
    expect(await countNewEnquiries()).toBe(3)

    const all = await listEnquiries({ status: 'ALL' })
    await db.enquiry.update({ where: { id: all[0]!.id }, data: { status: 'CONTACTED' } })
    expect(await countNewEnquiries()).toBe(2)
  })

  it('REFUSES to skip Turnstile verification in production', async () => {
    const { verifyTurnstile } = await import('@/lib/domain/enquiries')
    const prevEnv = process.env.NODE_ENV
    const prevSecret = process.env.TURNSTILE_SECRET_KEY
    Object.assign(process.env, { NODE_ENV: 'production' })
    delete process.env.TURNSTILE_SECRET_KEY

    expect(await verifyTurnstile('any-token', '1.2.3.4')).toBe(false)

    Object.assign(process.env, { NODE_ENV: prevEnv })
    if (prevSecret) process.env.TURNSTILE_SECRET_KEY = prevSecret
  })
})

describe('derived customers view (E6 / §9.9)', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedSettings()
    await seedLaunchCatalogue()
    const { invalidateSettings } = await import('@/lib/domain/settings')
    invalidateSettings()
  })

  async function paidOrderFor(email: string, sku = 'WHP-N2O-640-1', code?: string) {
    const { createPendingOrder } = await import('@/lib/domain/orders')
    const { settlePaidPayment } = await import('@/lib/domain/payment-settlement')
    const { order } = await createPendingOrder({
      lines: [{ sku, qty: 1 }],
      codeInput: code ?? null,
      delivery: aValidSlot(),
      contact: {
        name: 'Chef Tan',
        email,
        phone: '91234567',
        addressLine1: '12 Kitchen Road',
        postalCode: '123456',
      },
    })
    await db.payment.create({
      data: {
        orderId: order.id,
        provider: 'stripe',
        requestId: `pi_${order.reference}`,
        amountCents: order.totalCents,
        paymentStatus: 'PENDING',
      },
    })
    await settlePaidPayment({
      reference: order.reference,
      paidAmountCents: order.totalCents,
      providerPaymentId: `ch_${order.reference}`,
      method: 'paynow',
      actor: 'test',
    })
    return order
  }

  it('groups orders by normalised email, however the customer typed it', async () => {
    await paidOrderFor('Chef@Kitchen.SG')
    await paidOrderFor('chef@kitchen.sg')
    await paidOrderFor('  CHEF@KITCHEN.SG  '.trim())

    const { derivedCustomers } = await import('@/lib/domain/admin-orders')
    const customers = await derivedCustomers()

    expect(customers).toHaveLength(1)
    expect(customers[0]).toMatchObject({ orderCount: 3, lifetimeValueCents: 5000 * 3 })
  })

  it('lists the codes a customer has used', async () => {
    await makeCode({ code: 'WELCOME10', percentOff: 10 })
    await paidOrderFor('chef@kitchen.sg', 'WHP-N2O-640-1', 'WELCOME10')

    const { derivedCustomers } = await import('@/lib/domain/admin-orders')
    const customers = await derivedCustomers()
    expect(customers[0]!.codesUsed).toEqual(['WELCOME10'])
  })

  it('EXCLUDES unpaid and cancelled orders — it is a record of business done', async () => {
    const { createPendingOrder } = await import('@/lib/domain/orders')
    await createPendingOrder({
      lines: [{ sku: 'WHP-N2O-640-1', qty: 1 }],
      codeInput: null,
      delivery: aValidSlot(),
      contact: {
        name: 'Never Paid',
        email: 'never@paid.sg',
        phone: '91234567',
        addressLine1: '1 Road',
        postalCode: '123456',
      },
    })

    const { derivedCustomers } = await import('@/lib/domain/admin-orders')
    expect(await derivedCustomers()).toHaveLength(0)
  })

  it('stores nothing — there is no customer table', async () => {
    await paidOrderFor('chef@kitchen.sg')
    const tables = await db.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE '%customer%'
    `
    expect(tables).toHaveLength(0)
  })
})

describe('admin order queries (E2)', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedSettings()
    await seedLaunchCatalogue()
    const { invalidateSettings } = await import('@/lib/domain/settings')
    invalidateSettings()
  })

  async function order(name: string, email: string) {
    const { createPendingOrder } = await import('@/lib/domain/orders')
    const { order } = await createPendingOrder({
      lines: [{ sku: 'WHP-N2O-640-1', qty: 1 }],
      codeInput: null,
      delivery: aValidSlot(),
      contact: {
        name,
        email,
        phone: '91234567',
        addressLine1: '12 Kitchen Road',
        postalCode: '123456',
      },
    })
    return order
  }

  it('finds an order by reference, name, email or phone', async () => {
    const created = await order('Chef Tan', 'chef@kitchen.sg')
    const { listOrders } = await import('@/lib/domain/admin-orders')

    expect((await listOrders({ q: created.reference })).map((o) => o.id)).toEqual([created.id])
    expect((await listOrders({ q: 'chef tan' })).map((o) => o.id)).toEqual([created.id])
    expect((await listOrders({ q: 'CHEF@KITCHEN.SG' })).map((o) => o.id)).toEqual([created.id])
    expect((await listOrders({ q: '9123 4567' })).map((o) => o.id)).toEqual([created.id])
    expect(await listOrders({ q: 'nobody' })).toHaveLength(0)
  })

  it('counts orders per status for the filter tabs', async () => {
    await order('A', 'a@x.sg')
    await order('B', 'b@x.sg')
    const { orderCounts } = await import('@/lib/domain/admin-orders')
    const counts = await orderCounts()
    expect(counts.ALL).toBe(2)
    expect(counts.PENDING_PAYMENT).toBe(2)
  })
})

describe('the audit log (E3 / §9.8)', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedSettings()
  })

  it('records who changed what, from what, to what', async () => {
    const { recordAudit, listAudit } = await import('@/lib/domain/audit')
    await recordAudit({
      actorLabel: 'owner@whiply.sg',
      entity: 'product',
      entityId: 'abc',
      action: 'UPDATE_WITH_STOCK_CHANGE',
      before: { stockQty: 10 },
      after: { stockQty: 40, stockReason: 'Restock' },
      ip: '1.2.3.4',
    })

    const entries = await listAudit({ entity: 'product' })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      actorLabel: 'owner@whiply.sg',
      action: 'UPDATE_WITH_STOCK_CHANGE',
    })
    expect(entries[0]!.before).toEqual({ stockQty: 10 })
    expect(entries[0]!.after).toEqual({ stockQty: 40, stockReason: 'Restock' })
  })
})

describe('settings drive the storefront (E6 / §4.5)', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedSettings()
    await seedLaunchCatalogue()
  })

  it('a threshold change alters what the next basket is charged, with no deploy', async () => {
    const { priceBasket } = await import('@/lib/domain/basket')
    const { setSetting, invalidateSettings } = await import('@/lib/domain/settings')

    invalidateSettings()
    // A S$220 two-pack clears the S$200 threshold.
    const before = await priceBasket({ lines: [{ sku: 'WHP-N2O-2500-2', qty: 1 }] })
    expect(before.basket.deliveryFeeCents).toBe(0)

    await setSetting('free_delivery_threshold_cents', 25000)
    invalidateSettings()

    const after = await priceBasket({ lines: [{ sku: 'WHP-N2O-2500-2', qty: 1 }] })
    expect(after.basket.deliveryFeeCents).toBe(1000) // S$220 no longer qualifies
    expect(after.basket.freeDeliveryThresholdCents).toBe(25000)
  })

  it('a fee change alters BOTH speeds independently, with no deploy', async () => {
    const { setSetting, invalidateSettings } = await import('@/lib/domain/settings')
    const { priceBasket } = await import('@/lib/domain/basket')

    await setSetting('express_delivery_fee_cents', 3500)
    invalidateSettings()

    const std = await priceBasket({ lines: [{ sku: 'WHP-N2O-640-1', qty: 1 }] })
    const exp = await priceBasket({
      lines: [{ sku: 'WHP-N2O-640-1', qty: 1 }],
      deliveryMethod: 'EXPRESS',
    })
    expect(std.basket.deliveryFeeCents).toBe(1000)
    expect(exp.basket.deliveryFeeCents).toBe(3500)
  })

  it('the slot rules are settings too, so the shop can close early', async () => {
    const { setSetting, getSlotRules, invalidateSettings } = await import('@/lib/domain/settings')
    await setSetting('order_cutoff_hour', 18)
    invalidateSettings()
    expect((await getSlotRules()).orderCutoffHour).toBe(18)
  })

  it('REFUSES an invalid setting rather than storing it', async () => {
    const { setSetting } = await import('@/lib/domain/settings')
    await expect(setSetting('standard_delivery_fee_cents', -100)).rejects.toThrow()
    await expect(setSetting('free_delivery_threshold_cents', 'free')).rejects.toThrow()
    await expect(setSetting('store_open', 'yes')).rejects.toThrow()
    // 25 is not an hour.
    await expect(setSetting('delivery_first_hour', 25)).rejects.toThrow()
  })

  it('the store kill switch is a setting, not a deploy', async () => {
    const { setSetting, getSetting, invalidateSettings } = await import('@/lib/domain/settings')
    await setSetting('store_open', false)
    invalidateSettings()
    expect(await getSetting('store_open')).toBe(false)
  })
})
