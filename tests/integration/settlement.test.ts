import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import {
  db,
  resetDatabase,
  seedSettings,
  seedLaunchCatalogue,
  makeCode,
  aValidSlot,
} from './helpers'

/**
 * Milestone C3 — the highest-value hour in the build.
 *
 * These tests exercise the settlement transaction directly, which is the same
 * code path the webhook handler and the reconciliation job both call.
 */

async function makePendingOrder(opts: {
  lines: { sku: string; qty: number }[]
  code?: string | null
}) {
  const { createPendingOrder } = await import('@/lib/domain/orders')
  const result = await createPendingOrder({
    lines: opts.lines,
    codeInput: opts.code ?? null,
    delivery: aValidSlot(),
    contact: {
      name: 'Jane Baker',
      email: 'Jane@Example.com',
      phone: '9123 4567',
      addressLine1: '12 Kitchen Road',
      addressLine2: '#04-05',
      postalCode: '123456',
      instructions: 'Leave at the door',
    },
  })

  await db.payment.create({
    data: {
      orderId: result.order.id,
      provider: 'stripe',
      requestId: `pi_${result.order.reference}`,
      amountCents: result.order.totalCents,
      paymentStatus: 'PENDING',
    },
  })

  return result.order
}

describe('order creation (C1)', () => {
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

  it('prices the order on the SERVER and snapshots the line items', async () => {
    const order = await makePendingOrder({ lines: [{ sku: 'WHP-N2O-2500-1', qty: 1 }] })

    expect(order.subtotalCents).toBe(12000)
    expect(order.deliveryFeeCents).toBe(1000)
    expect(order.totalCents).toBe(13000)

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    })
    expect(row.orderStatus).toBe('PENDING_PAYMENT')
    expect(row.items[0]).toMatchObject({
      skuAtPurchase: 'WHP-N2O-2500-1',
      unitPriceCents: 12000,
      quantity: 1,
      lineTotalCents: 12000,
    })
  })

  it('keeps the SNAPSHOT price when the product price later changes', async () => {
    const order = await makePendingOrder({ lines: [{ sku: 'WHP-N2O-640-1', qty: 2 }] })
    await db.product.update({ where: { sku: 'WHP-N2O-640-1' }, data: { priceCents: 9900 } })

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    })
    expect(row.items[0]!.unitPriceCents).toBe(4000)
    expect(row.totalCents).toBe(order.totalCents)
  })

  it('normalises the phone number and email for the derived customer view', async () => {
    const order = await makePendingOrder({ lines: [{ sku: 'WHP-N2O-640-1', qty: 1 }] })
    const row = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(row.contactPhone).toBe('+6591234567')
    expect(row.normalisedEmail).toBe('jane@example.com')
  })

  it('generates a well-formed, unique reference', async () => {
    const a = await makePendingOrder({ lines: [{ sku: 'WHP-N2O-640-1', qty: 1 }] })
    const b = await makePendingOrder({ lines: [{ sku: 'WHP-N2O-640-1', qty: 1 }] })
    expect(a.reference).toMatch(/^WHP-\d{8}-[0-9A-HJKMNP-TV-Z]{5}$/)
    expect(a.reference).not.toBe(b.reference)
  })

  it('does NOT reserve stock — an unpaid order holds nothing', async () => {
    const before = await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640-1' } })
    await makePendingOrder({ lines: [{ sku: 'WHP-N2O-640-1', qty: 5 }] })
    const after = await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640-1' } })
    expect(after.stockQty).toBe(before.stockQty)
  })

  it('refuses an order whose every line is unbuyable', async () => {
    await db.product.updateMany({ data: { isActive: false } })
    const { createPendingOrder, CheckoutError } = await import('@/lib/domain/orders')
    await expect(
      createPendingOrder({
        lines: [{ sku: 'WHP-N2O-640-1', qty: 1 }],
        codeInput: null,
        delivery: aValidSlot(),
        contact: {
          email: 'jane@example.com',
          phone: '91234567',
          addressLine1: '12 Kitchen Road',
          postalCode: '123456',
        },
      }),
    ).rejects.toThrow(CheckoutError)
  })
})

describe('payment settlement (C3)', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedSettings()
    await seedLaunchCatalogue()
    const { invalidateSettings } = await import('@/lib/domain/settings')
    invalidateSettings()
    vi.restoreAllMocks()
  })

  it('marks the order PAID, deducts stock and records the method — ONE transaction', async () => {
    const order = await makePendingOrder({ lines: [{ sku: 'WHP-N2O-640-1', qty: 3 }] })
    const { settlePaidPayment } = await import('@/lib/domain/payment-settlement')

    const outcome = await settlePaidPayment({
      reference: order.reference,
      paidAmountCents: order.totalCents,
      providerPaymentId: 'pay_123',
      method: 'paynow_online',
      actor: 'test',
    })

    expect(outcome.kind).toBe('PAID')

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { payment: true, events: true },
    })
    expect(row.orderStatus).toBe('PAID')
    expect(row.paidAt).not.toBeNull()
    expect(row.payment?.paymentStatus).toBe('PAID')
    expect(row.payment?.method).toBe('paynow_online')

    const product = await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640-1' } })
    expect(product.stockQty).toBe(120 - 3)

    expect(row.events.map((e) => e.type)).toContain('PAID')
  })

  it('THE REPLAY TEST — the same event ten times produces ONE paid order and ONE deduction', async () => {
    const order = await makePendingOrder({ lines: [{ sku: 'WHP-N2O-640-1', qty: 2 }] })
    const { claimWebhookEvent, settlePaidPayment } = await import(
      '@/lib/domain/payment-settlement'
    )

    const eventId = 'pay_replay_me'
    const rawBody = `reference_number=${order.reference}&status=completed&amount=110.00`

    let settlements = 0
    for (let i = 0; i < 10; i += 1) {
      const claimed = await claimWebhookEvent({ provider: 'stripe', eventId, rawBody })
      if (!claimed) continue
      settlements += 1
      await settlePaidPayment({
        reference: order.reference,
        paidAmountCents: order.totalCents,
        providerPaymentId: eventId,
        method: 'card',
        actor: 'test',
      })
    }

    expect(settlements).toBe(1)
    expect(await db.webhookEvent.count()).toBe(1)

    const product = await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640-1' } })
    expect(product.stockQty).toBe(120 - 2)

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { events: true },
    })
    expect(row.orderStatus).toBe('PAID')
    expect(row.events.filter((e) => e.type === 'PAID')).toHaveLength(1)
  })

  it('even WITHOUT the de-duplication claim, a second settlement is refused', async () => {
    const order = await makePendingOrder({ lines: [{ sku: 'WHP-N2O-640-1', qty: 2 }] })
    const { settlePaidPayment } = await import('@/lib/domain/payment-settlement')

    await settlePaidPayment({
      reference: order.reference,
      paidAmountCents: order.totalCents,
      providerPaymentId: 'p1',
      method: 'card',
      actor: 'test',
    })
    const second = await settlePaidPayment({
      reference: order.reference,
      paidAmountCents: order.totalCents,
      providerPaymentId: 'p1',
      method: 'card',
      actor: 'test',
    })

    expect(second.kind).toBe('ALREADY_PAID')
    const product = await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640-1' } })
    expect(product.stockQty).toBe(118)
  })

  it('AMOUNT MISMATCH: flags for review, deducts nothing, ships nothing', async () => {
    const order = await makePendingOrder({ lines: [{ sku: 'WHP-N2O-640-1', qty: 1 }] })
    const { settlePaidPayment } = await import('@/lib/domain/payment-settlement')

    const outcome = await settlePaidPayment({
      reference: order.reference,
      paidAmountCents: 100, // S$1 for a S$55 order
      providerPaymentId: 'p_bad',
      method: 'card',
      actor: 'test',
    })

    expect(outcome).toMatchObject({ kind: 'AMOUNT_MISMATCH', expectedCents: order.totalCents })

    const row = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(row.orderStatus).toBe('REVIEW')
    expect(row.reviewReason).toContain('100')

    const product = await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640-1' } })
    expect(product.stockQty).toBe(120)
  })

  it('reports an unknown reference without throwing', async () => {
    const { settlePaidPayment } = await import('@/lib/domain/payment-settlement')
    const outcome = await settlePaidPayment({
      reference: 'WHP-20260101-ZZZZZ',
      paidAmountCents: 1000,
      providerPaymentId: 'p',
      method: null,
      actor: 'test',
    })
    expect(outcome.kind).toBe('ORDER_NOT_FOUND')
  })

  it('counts the discount code inside the SAME transaction', async () => {
    await makeCode({ code: 'WELCOME10', percentOff: 10 })
    const order = await makePendingOrder({
      lines: [{ sku: 'WHP-N2O-2500-1', qty: 1 }],
      code: 'welcome10',
    })
    expect(order.discountCents).toBe(1200)

    const { settlePaidPayment } = await import('@/lib/domain/payment-settlement')
    await settlePaidPayment({
      reference: order.reference,
      paidAmountCents: order.totalCents,
      providerPaymentId: 'p',
      method: 'paynow_online',
      actor: 'test',
    })

    const code = await db.discountCode.findUniqueOrThrow({ where: { code: 'WELCOME10' } })
    expect(code.usesCount).toBe(1)
    expect(await db.discountRedemption.count()).toBe(1)
  })

  it('OVERSELL: records the event, alerts, and still honours the payment', async () => {
    const order = await makePendingOrder({ lines: [{ sku: 'WHP-N2O-640-1', qty: 5 }] })
    // Someone else bought the stock between order creation and payment.
    await db.product.update({ where: { sku: 'WHP-N2O-640-1' }, data: { stockQty: 2 } })

    const { settlePaidPayment } = await import('@/lib/domain/payment-settlement')
    const outcome = await settlePaidPayment({
      reference: order.reference,
      paidAmountCents: order.totalCents,
      providerPaymentId: 'p',
      method: 'card',
      actor: 'test',
    })

    expect(outcome).toMatchObject({ kind: 'PAID', oversold: ['WHP-N2O-640-1'] })

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { events: true },
    })
    expect(row.orderStatus).toBe('PAID') // the customer paid; we owe them
    expect(row.events.map((e) => e.type)).toContain('OVERSOLD')

    const product = await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640-1' } })
    expect(product.stockQty).toBe(2) // never negative
  })

  it('CONCURRENT purchases of the last unit: one succeeds, stock never goes negative', async () => {
    await db.product.update({ where: { sku: 'WHP-N2O-640-1' }, data: { stockQty: 1 } })

    const a = await makePendingOrder({ lines: [{ sku: 'WHP-N2O-640-1', qty: 1 }] })
    const b = await makePendingOrder({ lines: [{ sku: 'WHP-N2O-640-1', qty: 1 }] })

    const { settlePaidPayment } = await import('@/lib/domain/payment-settlement')
    const [ra, rb] = await Promise.all([
      settlePaidPayment({
        reference: a.reference,
        paidAmountCents: a.totalCents,
        providerPaymentId: 'pa',
        method: 'card',
        actor: 'test',
      }),
      settlePaidPayment({
        reference: b.reference,
        paidAmountCents: b.totalCents,
        providerPaymentId: 'pb',
        method: 'card',
        actor: 'test',
      }),
    ])

    const product = await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640-1' } })
    expect(product.stockQty).toBe(0)
    expect(product.stockQty).toBeGreaterThanOrEqual(0)

    // Both customers paid, so both orders are PAID; exactly one is oversold.
    const oversold = [ra, rb].filter((r) => r.kind === 'PAID' && r.oversold.length > 0)
    expect(oversold).toHaveLength(1)
  })
})
