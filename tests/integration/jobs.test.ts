import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { db, resetDatabase, seedSettings, seedLaunchCatalogue } from './helpers'

const hitpayCalls: string[] = []

vi.mock('@/lib/payments/hitpay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/payments/hitpay')>()
  return {
    ...actual,
    getPaymentRequest: vi.fn(async (requestId: string) => {
      hitpayCalls.push(`getPaymentRequest:${requestId}`)
      return {
        requestId,
        status: 'completed',
        paidAmountCents: 5500,
        paymentId: 'pay_reconciled',
        method: 'paynow_online',
      }
    }),
    refundPayment: vi.fn(async () => {
      hitpayCalls.push('refundPayment')
      return { refundId: 'refund_1' }
    }),
  }
})

vi.mock('@/lib/delivery/lalamove', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/delivery/lalamove')>()
  return {
    ...actual,
    requestQuotation: vi.fn(async () => ({
      quotationId: 'q',
      priceCents: 1000,
      expiresAt: null,
    })),
    placeOrder: vi.fn(async () => ({
      providerRef: 'LLM-9',
      priceCents: 1000,
      shareLink: null,
      status: 'ASSIGNING_DRIVER',
    })),
  }
})

async function pendingOrder(opts: { createdAt?: Date } = {}) {
  const { createPendingOrder } = await import('@/lib/domain/orders')
  const { order } = await createPendingOrder({
    lines: [{ sku: 'WHP-N2O-640', qty: 1 }],
    codeInput: null,
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
      provider: 'hitpay',
      requestId: `req_${order.reference}`,
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
    hitpayCalls.length = 0
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
    // Reconciliation settles AND enqueues dispatch, exactly as the webhook
    // does — so with the gate off (the default) the order lands in
    // READY_FOR_DELIVERY rather than sitting at PAID.
    expect(row.orderStatus).toBe('READY_FOR_DELIVERY')
    expect(row.paidAt).not.toBeNull()
    expect(row.payment?.paymentStatus).toBe('PAID')
    expect(row.payment?.paymentId).toBe('pay_reconciled')

    // Stock was deducted exactly once, by the same code path as the webhook.
    const product = await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640' } })
    expect(product.stockQty).toBe(119)
    expect(row.events.filter((e) => e.type === 'PAID')).toHaveLength(1)
  })

  it('LEAVES A FRESH ORDER ALONE — no provider call within the grace period', async () => {
    await pendingOrder()
    const { reconcilePayments } = await import('@/lib/jobs/reconcile-payments')
    const result = await reconcilePayments()
    expect(result.checked).toBe(0)
    expect(hitpayCalls).toEqual([])
  })

  it('does not re-settle an order the webhook already handled', async () => {
    const order = await pendingOrder({ createdAt: new Date(Date.now() - 20 * 60_000) })
    const { settlePaidPayment } = await import('@/lib/domain/payment-settlement')
    await settlePaidPayment({
      reference: order.reference,
      paidAmountCents: order.totalCents,
      hitpayPaymentId: 'pay_webhook',
      method: 'card',
      actor: 'webhook',
    })

    const { reconcilePayments } = await import('@/lib/jobs/reconcile-payments')
    const result = await reconcilePayments()

    expect(result.checked).toBe(0)
    const product = await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640' } })
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
    const stockBefore = (await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640' } }))
      .stockQty

    const { expireStaleOrders } = await import('@/lib/jobs/expire-orders')
    expect(await expireStaleOrders()).toBe(1)

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { payment: true },
    })
    expect(row.orderStatus).toBe('CANCELLED')
    expect(row.payment?.paymentStatus).toBe('EXPIRED')

    const stockAfter = (await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640' } }))
      .stockQty
    expect(stockAfter).toBe(stockBefore)
  })

  it('leaves a PAID order untouched', async () => {
    const order = await pendingOrder({ createdAt: new Date(Date.now() - 3 * 3600_000) })
    const { settlePaidPayment } = await import('@/lib/domain/payment-settlement')
    await settlePaidPayment({
      reference: order.reference,
      paidAmountCents: order.totalCents,
      hitpayPaymentId: 'p',
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
    hitpayCalls.length = 0
  })

  async function paidOrder() {
    const order = await pendingOrder()
    const { settlePaidPayment } = await import('@/lib/domain/payment-settlement')
    await settlePaidPayment({
      reference: order.reference,
      paidAmountCents: order.totalCents,
      hitpayPaymentId: 'pay_1',
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
    expect(hitpayCalls).toContain('refundPayment')

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

    const product = await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640' } })
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

    const product = await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640' } })
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
    expect(hitpayCalls).not.toContain('refundPayment')
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
    const product = await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640' } })
    expect(product.stockQty).toBe(120)
  })

  it('REFUSES to cancel an order whose courier is already booked', async () => {
    const order = await paidOrder()
    await db.delivery.create({
      data: { orderId: order.id, providerRef: 'LLM-1', deliveryStatus: 'DRIVER_ASSIGNED' },
    })
    const { cancelOrder } = await import('@/lib/domain/refunds')
    const result = await cancelOrder({ orderId: order.id, actor: 'admin', reason: 'x' })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/courier/i)
  })
})
