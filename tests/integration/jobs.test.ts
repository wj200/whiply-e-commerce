import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import {
  db,
  resetDatabase,
  seedSettings,
  seedLaunchCatalogue,
  aValidSlot,
} from './helpers'

const stripeCalls: string[] = []

// A S$40 tank plus S$10 standard delivery — what `pendingOrder` below costs.
const ORDER_TOTAL = 5000

vi.mock('@/lib/payments/stripe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/payments/stripe')>()
  return {
    ...actual,
    getPaymentIntent: vi.fn(async (id: string) => {
      stripeCalls.push(`getPaymentIntent:${id}`)
      return {
        id,
        status: 'succeeded',
        amountCents: ORDER_TOTAL,
        amountReceivedCents: ORDER_TOTAL,
        chargeId: 'ch_reconciled',
        reference: null,
      }
    }),
    refundPaymentIntent: vi.fn(async () => {
      stripeCalls.push('refundPaymentIntent')
      return { refundId: 'refund_1', status: 'pending' }
    }),
  }
})

// The notification adapters reach the network. Every test here is about the
// JOB, so they are stubbed to succeed; their own behaviour is tested in
// notifications.test.ts.
vi.mock('@/lib/notify/receipt-email', () => ({
  sendReceiptEmail: vi.fn(async () => ({ sent: true, providerId: 'em_1' })),
}))
vi.mock('@/lib/notify/whatsapp', () => ({
  sendBusinessOrderAlert: vi.fn(async () => ({ sent: true, messageId: 'wam_1' })),
}))

async function pendingOrder(opts: { createdAt?: Date } = {}) {
  const { createPendingOrder } = await import('@/lib/domain/orders')
  const { order } = await createPendingOrder({
    lines: [{ sku: 'WHP-N2O-640-1', qty: 1 }],
    codeInput: null,
    delivery: aValidSlot(),
    contact: {
      name: 'Jane Baker',
      email: 'jane@example.com',
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

  if (opts.createdAt) {
    await db.order.update({ where: { id: order.id }, data: { createdAt: opts.createdAt } })
  }

  return order
}

describe('payment reconciliation (C5)', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedSettings()
    await seedLaunchCatalogue()
    const { invalidateSettings } = await import('@/lib/domain/settings')
    invalidateSettings()
    stripeCalls.length = 0
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it('RECOVERS an order whose webhook never arrived, through the same transaction', async () => {
    const order = await pendingOrder({ createdAt: new Date(Date.now() - 20 * 60_000) })
    const { reconcilePayments } = await import('@/lib/jobs/reconcile-payments')

    const result = await reconcilePayments()

    expect(result).toMatchObject({ checked: 1, settled: 1 })

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { payment: true, events: true },
    })
    // Reconciliation runs the SAME after-payment pipeline the webhook does,
    // so the order ends up scheduled against the slot it booked rather than
    // sitting at PAID waiting for someone to notice.
    expect(row.orderStatus).toBe('DELIVERY_BOOKED')
    expect(row.paidAt).not.toBeNull()
    expect(row.payment?.paymentStatus).toBe('PAID')
    expect(row.payment?.paymentId).toBe('ch_reconciled')
    // And the customer got their receipt, and the shop got its alert.
    expect(row.payment?.receiptSentAt).not.toBeNull()
    expect(row.payment?.notifiedAt).not.toBeNull()

    // Stock was deducted exactly once, by the same code path as the webhook.
    const product = await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640-1' } })
    expect(product.stockQty).toBe(119)
    expect(row.events.filter((e) => e.type === 'PAID')).toHaveLength(1)
  })

  it('LEAVES A FRESH ORDER ALONE — no provider call within the grace period', async () => {
    await pendingOrder()
    const { reconcilePayments } = await import('@/lib/jobs/reconcile-payments')
    const result = await reconcilePayments()
    expect(result.checked).toBe(0)
    expect(stripeCalls).toEqual([])
  })

  it('does not re-settle an order the webhook already handled', async () => {
    const order = await pendingOrder({ createdAt: new Date(Date.now() - 20 * 60_000) })
    const { settlePaidPayment } = await import('@/lib/domain/payment-settlement')
    await settlePaidPayment({
      reference: order.reference,
      paidAmountCents: order.totalCents,
      providerPaymentId: 'pay_webhook',
      method: 'card',
      actor: 'webhook',
    })

    const { reconcilePayments } = await import('@/lib/jobs/reconcile-payments')
    const result = await reconcilePayments()

    expect(result.checked).toBe(0)
    const product = await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640-1' } })
    expect(product.stockQty).toBe(119)
  })
})

describe('order expiry (C5)', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedSettings()
    await seedLaunchCatalogue()
    const { invalidateSettings } = await import('@/lib/domain/settings')
    invalidateSettings()
  })

  it('cancels a stale unpaid order and releases NOTHING, because it held nothing', async () => {
    const order = await pendingOrder({ createdAt: new Date(Date.now() - 3 * 3600_000) })
    const stockBefore = (await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640-1' } }))
      .stockQty

    const { expireStaleOrders } = await import('@/lib/jobs/expire-orders')
    expect(await expireStaleOrders()).toBe(1)

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { payment: true },
    })
    expect(row.orderStatus).toBe('CANCELLED')
    expect(row.payment?.paymentStatus).toBe('EXPIRED')

    const stockAfter = (await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640-1' } }))
      .stockQty
    expect(stockAfter).toBe(stockBefore)
  })

  it('leaves a PAID order untouched', async () => {
    const order = await pendingOrder({ createdAt: new Date(Date.now() - 3 * 3600_000) })
    const { settlePaidPayment } = await import('@/lib/domain/payment-settlement')
    await settlePaidPayment({
      reference: order.reference,
      paidAmountCents: order.totalCents,
      providerPaymentId: 'p',
      method: 'card',
      actor: 'test',
    })

    const { expireStaleOrders } = await import('@/lib/jobs/expire-orders')
    expect(await expireStaleOrders()).toBe(0)
    const row = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(row.orderStatus).toBe('PAID')
  })

  it('leaves a fresh unpaid order alone', async () => {
    await pendingOrder()
    const { expireStaleOrders } = await import('@/lib/jobs/expire-orders')
    expect(await expireStaleOrders()).toBe(0)
  })
})

describe('refunds and cancellation (C6)', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedSettings()
    await seedLaunchCatalogue()
    const { invalidateSettings } = await import('@/lib/domain/settings')
    invalidateSettings()
    stripeCalls.length = 0
  })

  async function paidOrder() {
    const order = await pendingOrder()
    const { settlePaidPayment } = await import('@/lib/domain/payment-settlement')
    await settlePaidPayment({
      reference: order.reference,
      paidAmountCents: order.totalCents,
      providerPaymentId: 'pay_1',
      method: 'card',
      actor: 'test',
    })
    return order
  }

  it('refunds through the provider and records both statuses', async () => {
    const order = await paidOrder()
    const { refundOrder } = await import('@/lib/domain/refunds')

    const result = await refundOrder({
      orderId: order.id,
      actor: 'admin:owner',
      restoreStock: true,
      reason: 'Customer changed their mind',
    })

    expect(result).toMatchObject({ ok: true, refundId: 'refund_1' })
    expect(stripeCalls).toContain('refundPaymentIntent')

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { payment: true, events: true },
    })
    expect(row.orderStatus).toBe('REFUNDED')
    expect(row.payment?.paymentStatus).toBe('REFUNDED')
    expect(row.payment?.refundedCents).toBe(order.totalCents)

    // Stock restoration is RECORDED with its reason.
    const restored = row.events.find((e) => e.type === 'STOCK_RESTORED')
    expect(restored).toBeDefined()
    expect((restored!.detail as { reason: string }).reason).toBe('Customer changed their mind')

    const product = await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640-1' } })
    expect(product.stockQty).toBe(120)
  })

  it('can refund WITHOUT restoring stock — goods already with the customer', async () => {
    const order = await paidOrder()
    const { refundOrder } = await import('@/lib/domain/refunds')

    await refundOrder({
      orderId: order.id,
      actor: 'admin:owner',
      restoreStock: false,
      reason: 'Delivered but damaged',
    })

    const product = await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640-1' } })
    expect(product.stockQty).toBe(119)
  })

  it('refuses to refund an unpaid order', async () => {
    const order = await pendingOrder()
    const { refundOrder } = await import('@/lib/domain/refunds')
    const result = await refundOrder({
      orderId: order.id,
      actor: 'admin:owner',
      restoreStock: false,
      reason: 'x',
    })
    expect(result).toMatchObject({ ok: false })
    expect(stripeCalls).not.toContain('refundPaymentIntent')
  })

  it('cancelling a paid order restores stock', async () => {
    const order = await paidOrder()
    const { cancelOrder } = await import('@/lib/domain/refunds')
    const result = await cancelOrder({
      orderId: order.id,
      actor: 'admin:owner',
      reason: 'Out of stock at the warehouse',
    })
    expect(result.ok).toBe(true)
    const product = await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640-1' } })
    expect(product.stockQty).toBe(120)
  })

  it('REFUSES to cancel an order that has already left', async () => {
    const order = await paidOrder()
    await db.delivery.upsert({
      where: { orderId: order.id },
      create: { orderId: order.id, deliveryStatus: 'OUT_FOR_DELIVERY' },
      update: { deliveryStatus: 'OUT_FOR_DELIVERY' },
    })
    const { cancelOrder } = await import('@/lib/domain/refunds')
    const result = await cancelOrder({ orderId: order.id, actor: 'admin', reason: 'x' })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/already left/i)
  })

  it('ALLOWS cancelling one that is only scheduled', async () => {
    const order = await paidOrder()
    const { cancelOrder } = await import('@/lib/domain/refunds')
    const result = await cancelOrder({ orderId: order.id, actor: 'admin', reason: 'Out of stock' })
    expect(result.ok).toBe(true)
  })
})
