import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { db, resetDatabase, seedSettings, seedLaunchCatalogue } from './helpers'
import { cents } from '@/lib/money'

const courierCalls: string[] = []
let cancelShouldFail = false

vi.mock('@/lib/delivery/lalamove', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/delivery/lalamove')>()
  return {
    ...actual,
    requestQuotation: vi.fn(async () => {
      courierCalls.push('requestQuotation')
      return { quotationId: 'q_1', priceCents: 1340, expiresAt: null }
    }),
    placeOrder: vi.fn(async () => {
      courierCalls.push('placeOrder')
      return {
        providerRef: 'LLM-123',
        priceCents: 1340,
        shareLink: 'https://share.example/LLM-123',
        status: 'ASSIGNING_DRIVER',
      }
    }),
    cancelOrder: vi.fn(async () => {
      courierCalls.push('cancelOrder')
      if (cancelShouldFail) throw new actual.LalamoveError('Too late to cancel', 409, false)
    }),
    getOrder: vi.fn(async (ref: string) => {
      courierCalls.push('getOrder')
      return {
        providerRef: ref,
        priceCents: 1400,
        shareLink: null,
        status: 'COMPLETED',
        driverId: 'drv_1',
      }
    }),
    getDriver: vi.fn(async () => {
      courierCalls.push('getDriver')
      return { name: 'A. Driver', phone: '+6598765432', plateNumber: 'SGX1234A' }
    }),
  }
})

const PICKUP = {
  line1: '8 Warehouse Way',
  line2: '#01-02',
  postalCode: '654321',
  contactName: 'WHIPLY Warehouse',
  contactPhone: '+6561234567',
}

async function paidOrder(sku = 'WHP-N2O-640') {
  const { createPendingOrder } = await import('@/lib/domain/orders')
  const { settlePaidPayment } = await import('@/lib/domain/payment-settlement')

  const { order } = await createPendingOrder({
    lines: [{ sku, qty: 1 }],
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

  await settlePaidPayment({
    reference: order.reference,
    paidAmountCents: order.totalCents,
    // Provider payment ids are globally unique and the column enforces it,
    // so each test order needs its own.
    hitpayPaymentId: `pay_${order.reference}`,
    method: 'card',
    actor: 'test',
  })

  return order
}

async function bookedOrder() {
  const order = await paidOrder()
  const { bookDeliveryManually } = await import('@/lib/domain/manual-delivery')
  await bookDeliveryManually({ orderId: order.id, actor: 'admin:test' })
  return order
}

/** Milestone D4 — courier status updates. */
describe('delivery status transitions (D4)', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedSettings({ auto_dispatch_enabled: false, pickup_address: PICKUP })
    await seedLaunchCatalogue()
    const { invalidateSettings } = await import('@/lib/domain/settings')
    invalidateSettings()
    courierCalls.length = 0
    cancelShouldFail = false
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it('walks an order through to DELIVERED', async () => {
    const order = await bookedOrder()
    const { applyDeliveryStatus } = await import('@/lib/domain/delivery-status')

    for (const status of ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED'] as const) {
      const outcome = await applyDeliveryStatus({
        providerRef: 'LLM-123',
        status,
        actor: 'webhook:lalamove',
      })
      expect(outcome.kind).toBe('APPLIED')
    }

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { delivery: true },
    })
    expect(row.orderStatus).toBe('DELIVERED')
    expect(row.delivery?.deliveryStatus).toBe('DELIVERED')
    expect(row.delivery?.deliveredAt).not.toBeNull()
  })

  it('maps PICKED_UP and IN_TRANSIT both to OUT_FOR_DELIVERY', async () => {
    const order = await bookedOrder()
    const { applyDeliveryStatus } = await import('@/lib/domain/delivery-status')

    await applyDeliveryStatus({ providerRef: 'LLM-123', status: 'PICKED_UP', actor: 'test' })
    let row = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(row.orderStatus).toBe('OUT_FOR_DELIVERY')

    await applyDeliveryStatus({ providerRef: 'LLM-123', status: 'IN_TRANSIT', actor: 'test' })
    row = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(row.orderStatus).toBe('OUT_FOR_DELIVERY')
  })

  it('A LATE PICKED_UP AFTER DELIVERED CHANGES NOTHING', async () => {
    const order = await bookedOrder()
    const { applyDeliveryStatus } = await import('@/lib/domain/delivery-status')

    await applyDeliveryStatus({ providerRef: 'LLM-123', status: 'PICKED_UP', actor: 'test' })
    await applyDeliveryStatus({ providerRef: 'LLM-123', status: 'DELIVERED', actor: 'test' })

    const outcome = await applyDeliveryStatus({
      providerRef: 'LLM-123',
      status: 'PICKED_UP',
      actor: 'webhook:lalamove',
    })

    expect(outcome).toMatchObject({ kind: 'IGNORED_STALE', current: 'DELIVERED' })

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { delivery: true },
    })
    expect(row.orderStatus).toBe('DELIVERED')
    expect(row.delivery?.deliveryStatus).toBe('DELIVERED')
  })

  it('OUT-OF-ORDER ARRIVAL still ends in the correct final state', async () => {
    const order = await bookedOrder()
    const { applyDeliveryStatus } = await import('@/lib/domain/delivery-status')

    // Provider delivers them backwards.
    await applyDeliveryStatus({ providerRef: 'LLM-123', status: 'DELIVERED', actor: 'test' })
    await applyDeliveryStatus({ providerRef: 'LLM-123', status: 'IN_TRANSIT', actor: 'test' })
    await applyDeliveryStatus({ providerRef: 'LLM-123', status: 'PICKED_UP', actor: 'test' })

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { delivery: true },
    })
    expect(row.delivery?.deliveryStatus).toBe('DELIVERED')
    expect(row.orderStatus).toBe('DELIVERED')
  })

  it('ignores a repeat of the current status', async () => {
    await bookedOrder()
    const { applyDeliveryStatus } = await import('@/lib/domain/delivery-status')
    const outcome = await applyDeliveryStatus({
      providerRef: 'LLM-123',
      status: 'DRIVER_ASSIGNED',
      actor: 'test',
    })
    expect(outcome).toMatchObject({ kind: 'IGNORED_UNCHANGED' })
  })

  it('a CANCELLED delivery returns the order to READY_FOR_DELIVERY — the goods still need to go', async () => {
    const order = await bookedOrder()
    const { applyDeliveryStatus } = await import('@/lib/domain/delivery-status')

    await applyDeliveryStatus({ providerRef: 'LLM-123', status: 'CANCELLED', actor: 'test' })

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { delivery: true },
    })
    expect(row.orderStatus).toBe('READY_FOR_DELIVERY')
    expect(row.delivery?.deliveryStatus).toBe('CANCELLED')
  })

  it('a FAILED delivery keeps the order at READY_FOR_DELIVERY', async () => {
    const order = await bookedOrder()
    const { applyDeliveryStatus } = await import('@/lib/domain/delivery-status')
    await applyDeliveryStatus({ providerRef: 'LLM-123', status: 'FAILED', actor: 'test' })
    const row = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(row.orderStatus).toBe('READY_FOR_DELIVERY')
  })

  it('stores driver details and the tracking link', async () => {
    await bookedOrder()
    const { applyDeliveryStatus } = await import('@/lib/domain/delivery-status')
    await applyDeliveryStatus({
      providerRef: 'LLM-123',
      status: 'PICKED_UP',
      actor: 'test',
      driver: { name: 'A. Driver', phone: '+6598765432', plateNumber: 'SGX1234A' },
      trackingUrl: 'https://share.example/LLM-123',
    })

    const delivery = await db.delivery.findFirstOrThrow({ where: { providerRef: 'LLM-123' } })
    expect(delivery.driver).toMatchObject({ name: 'A. Driver', plateNumber: 'SGX1234A' })
    expect(delivery.trackingUrl).toBe('https://share.example/LLM-123')
  })

  it('reports an unknown provider reference without throwing', async () => {
    const { applyDeliveryStatus } = await import('@/lib/domain/delivery-status')
    const outcome = await applyDeliveryStatus({
      providerRef: 'LLM-NOPE',
      status: 'DELIVERED',
      actor: 'test',
    })
    expect(outcome.kind).toBe('DELIVERY_NOT_FOUND')
  })
})

/** Milestone D5 — manual and off-platform delivery. */
describe('manual booking and off-platform deliveries (D5)', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedSettings({ auto_dispatch_enabled: false, pickup_address: PICKUP })
    await seedLaunchCatalogue()
    const { invalidateSettings } = await import('@/lib/domain/settings')
    invalidateSettings()
    courierCalls.length = 0
    cancelShouldFail = false
  })

  it('an operator books a courier for an order the GATE left unbooked', async () => {
    const order = await paidOrder()
    const { runDispatch } = await import('@/lib/jobs/dispatch')
    await runDispatch(order.id)

    // Gate off: nothing booked, no courier call.
    expect(courierCalls).toEqual([])
    const beforeBooking = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(beforeBooking.orderStatus).toBe('READY_FOR_DELIVERY')

    // The human is the gate.
    const { bookDeliveryManually } = await import('@/lib/domain/manual-delivery')
    const outcome = await bookDeliveryManually({ orderId: order.id, actor: 'admin:owner' })

    expect(outcome).toMatchObject({ kind: 'BOOKED', providerRef: 'LLM-123' })
    expect(courierCalls).toEqual(['requestQuotation', 'placeOrder'])

    const afterBooking = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { delivery: true, events: true },
    })
    expect(afterBooking.orderStatus).toBe('DELIVERY_BOOKED')
    expect(afterBooking.delivery?.providerRef).toBe('LLM-123')
    // Same audit trail as the automatic path, naming the operator.
    expect(afterBooking.events.some((e) => e.actor === 'admin:owner')).toBe(true)
  })

  it('manual booking uses the SAME idempotency key as automatic dispatch', async () => {
    const order = await paidOrder()
    const { bookDeliveryManually } = await import('@/lib/domain/manual-delivery')
    const lalamove = await import('@/lib/delivery/lalamove')

    await bookDeliveryManually({ orderId: order.id, actor: 'admin:owner' })

    expect(vi.mocked(lalamove.placeOrder)).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: order.id }),
    )
  })

  it('previews a quotation before the operator confirms', async () => {
    const order = await paidOrder()
    const { previewQuotation } = await import('@/lib/domain/manual-delivery')
    const preview = await previewQuotation(order.id)
    expect(preview).toMatchObject({ ok: true, priceCents: 1340 })
    expect(courierCalls).toEqual(['requestQuotation'])
  })

  it('records an OFF-PLATFORM delivery with no provider call at all', async () => {
    const order = await paidOrder()
    const { recordManualDelivery } = await import('@/lib/domain/manual-delivery')

    const result = await recordManualDelivery({
      orderId: order.id,
      actor: 'admin:owner',
      reference: 'Own van — driver Ravi',
      actualCostCents: 2500,
      note: 'Lalamove would not carry the cylinders',
    })

    expect(result.ok).toBe(true)
    expect(courierCalls).toEqual([])

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { delivery: true },
    })
    expect(row.orderStatus).toBe('DELIVERY_BOOKED')
    expect(row.delivery).toMatchObject({
      provider: 'MANUAL',
      providerRef: 'Own van — driver Ravi',
      actualCostCents: 2500,
    })
  })

  it('walks an off-platform delivery forward by hand, through the same guarded applier', async () => {
    const order = await paidOrder()
    const { recordManualDelivery, advanceManualDelivery } = await import(
      '@/lib/domain/manual-delivery'
    )
    await recordManualDelivery({
      orderId: order.id,
      actor: 'admin:owner',
      reference: 'MANUAL-1',
      actualCostCents: null,
    })

    expect(await advanceManualDelivery({ orderId: order.id, status: 'PICKED_UP', actor: 'admin' }))
      .toMatchObject({ ok: true })
    expect(await advanceManualDelivery({ orderId: order.id, status: 'DELIVERED', actor: 'admin' }))
      .toMatchObject({ ok: true })

    const row = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(row.orderStatus).toBe('DELIVERED')

    // And the guard applies here too.
    const backwards = await advanceManualDelivery({
      orderId: order.id,
      status: 'PICKED_UP',
      actor: 'admin',
    })
    expect(backwards.ok).toBe(false)
  })

  it('cancels a courier booking and returns the order to READY_FOR_DELIVERY', async () => {
    const order = await bookedOrder()
    const { cancelDeliveryBooking } = await import('@/lib/domain/manual-delivery')

    const result = await cancelDeliveryBooking({
      orderId: order.id,
      actor: 'admin:owner',
      reason: 'Customer asked to delay',
    })

    expect(result.ok).toBe(true)
    expect(courierCalls).toContain('cancelOrder')

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { delivery: true },
    })
    expect(row.orderStatus).toBe('READY_FOR_DELIVERY')
    expect(row.delivery?.deliveryStatus).toBe('CANCELLED')
    expect(row.delivery?.providerRef).toBeNull() // re-bookable
  })

  it('REFUSES to cancel once the goods are with the driver', async () => {
    const order = await bookedOrder()
    const { applyDeliveryStatus } = await import('@/lib/domain/delivery-status')
    await applyDeliveryStatus({ providerRef: 'LLM-123', status: 'PICKED_UP', actor: 'test' })

    const { cancelDeliveryBooking } = await import('@/lib/domain/manual-delivery')
    const result = await cancelDeliveryBooking({
      orderId: order.id,
      actor: 'admin',
      reason: 'x',
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/already with the driver/i)
  })

  it('does not mark the order cancelled when the PROVIDER refuses the cancellation', async () => {
    const order = await bookedOrder()
    cancelShouldFail = true

    const { cancelDeliveryBooking } = await import('@/lib/domain/manual-delivery')
    const result = await cancelDeliveryBooking({ orderId: order.id, actor: 'admin', reason: 'x' })

    expect(result.ok).toBe(false)
    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { delivery: true },
    })
    expect(row.delivery?.providerRef).toBe('LLM-123') // still booked
    expect(row.orderStatus).toBe('DELIVERY_BOOKED')
  })
})

/** Milestone D6 — reconciliation and cost reporting. */
describe('delivery reconciliation and cost reporting (D6)', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedSettings({ auto_dispatch_enabled: false, pickup_address: PICKUP })
    await seedLaunchCatalogue()
    const { invalidateSettings } = await import('@/lib/domain/settings')
    invalidateSettings()
    courierCalls.length = 0
  })

  it('RECOVERS a delivery completed while webhooks were blocked', async () => {
    const order = await bookedOrder()
    // Age the row past the staleness window.
    await db.delivery.updateMany({
      where: { orderId: order.id },
      data: { updatedAt: new Date(Date.now() - 45 * 60_000) },
    })

    const { reconcileDeliveries } = await import('@/lib/jobs/reconcile-deliveries')
    const result = await reconcileDeliveries()

    expect(result).toMatchObject({ checked: 1, updated: 1 })
    expect(courierCalls).toContain('getOrder')

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { delivery: true },
    })
    expect(row.orderStatus).toBe('DELIVERED')
    expect(row.delivery?.actualCostCents).toBe(1400) // final price from the provider
    expect(row.delivery?.driver).toMatchObject({ plateNumber: 'SGX1234A' })
  })

  it('LEAVES A FRESH delivery alone — no provider call', async () => {
    await bookedOrder()
    const { reconcileDeliveries } = await import('@/lib/jobs/reconcile-deliveries')
    const result = await reconcileDeliveries()
    expect(result.checked).toBe(0)
    expect(courierCalls).not.toContain('getOrder')
  })

  it('reports delivery margin: fee charged vs actual courier cost (§7.5)', async () => {
    // S$35 charger -> S$20 fee, courier costs S$13.40 -> +S$6.60
    const paidSmall = await paidOrder('WHP-N2O-640')
    const { bookDeliveryManually } = await import('@/lib/domain/manual-delivery')
    await bookDeliveryManually({ orderId: paidSmall.id, actor: 'admin' })

    // S$550 mixer -> free delivery, courier still costs S$13.40 -> −S$13.40
    const paidLarge = await paidOrder('WHP-EQ-MIXER')
    const lalamove = await import('@/lib/delivery/lalamove')
    vi.mocked(lalamove.placeOrder).mockResolvedValueOnce({
      providerRef: 'LLM-456',
      priceCents: cents(1340),
      shareLink: null,
      status: 'ASSIGNING_DRIVER',
    })
    await bookDeliveryManually({ orderId: paidLarge.id, actor: 'admin' })

    const { deliveryCostSummary } = await import('@/lib/domain/delivery-reporting')
    const summary = await deliveryCostSummary()

    expect(summary.deliveries).toBe(2)
    expect(summary.feesCollectedCents).toBe(2000) // one paid S$20, one free
    expect(summary.actualCostCents).toBe(2680) // 2 x S$13.40
    expect(summary.marginCents).toBe(2000 - 2680) // subsidised overall
    expect(summary.freeDeliveryCount).toBe(1)
    expect(summary.freeDeliveryCostCents).toBe(1340)
  })

  it('exports exactly the rows shown, as CSV', async () => {
    const order = await bookedOrder()
    const { listDeliveries, deliveriesToCsv } = await import('@/lib/domain/delivery-reporting')

    const rows = await listDeliveries({})
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      reference: order.reference,
      provider: 'LALAMOVE',
      feeChargedCents: 2000,
      actualCostCents: 1340,
    })

    const csv = deliveriesToCsv(rows)
    const [header, line] = csv.split('\n')
    expect(header).toContain('margin_sgd')
    expect(line).toContain(order.reference)
    expect(line).toContain('20.00') // fee charged
    expect(line).toContain('13.40') // actual cost
    expect(line).toContain('6.60') // margin
  })
})
