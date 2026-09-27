import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import {
  db,
  resetDatabase,
  seedSettings,
  seedLaunchCatalogue,
  aValidSlot,
} from './helpers'

/**
 * Milestone D — SELF-MANAGED FULFILMENT (§7).
 *
 * There is no courier API to mock here, which is the point: every status
 * change is an operator saying what happened, and the domain's job is to
 * refuse the ones that cannot have happened.
 */

async function paidOrder(opts: { withSlot?: boolean } = {}) {
  const { createPendingOrder } = await import('@/lib/domain/orders')
  const { settlePaidPayment } = await import('@/lib/domain/payment-settlement')

  const { order } = await createPendingOrder({
    lines: [{ sku: 'WHP-N2O-640-1', qty: 1 }],
    codeInput: null,
    delivery: aValidSlot(),
    contact: {
      email: 'chef@kitchen.sg',
      phone: '91234567',
      addressLine1: '12 Kitchen Road',
      postalCode: '123456',
    },
  })

  if (opts.withSlot === false) {
    await db.order.update({
      where: { id: order.id },
      data: { deliverySlotStart: null, deliverySlotEnd: null },
    })
  }

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

describe('opening fulfilment', () => {
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

  it('an order that booked a slot arrives already SCHEDULED', async () => {
    const order = await paidOrder()
    const { openFulfilment } = await import('@/lib/domain/fulfilment')
    await openFulfilment(order.id)

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { delivery: true, events: true },
    })
    expect(row.delivery?.deliveryStatus).toBe('SCHEDULED')
    expect(row.orderStatus).toBe('DELIVERY_BOOKED')

    // PAID → DELIVERY_BOOKED is not a legal transition; it went through
    // PROCESSING, and the timeline says so.
    expect(row.events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['FULFILMENT_OPENED', 'SLOT_CONFIRMED']),
    )
  })

  it('an order with no slot waits at READY_FOR_DELIVERY', async () => {
    const order = await paidOrder({ withSlot: false })
    const { openFulfilment } = await import('@/lib/domain/fulfilment')
    await openFulfilment(order.id)

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { delivery: true },
    })
    expect(row.delivery?.deliveryStatus).toBe('NOT_SCHEDULED')
    expect(row.orderStatus).toBe('READY_FOR_DELIVERY')
  })

  it('is IDEMPOTENT — a replayed webhook does not open a second record', async () => {
    const order = await paidOrder()
    const { openFulfilment } = await import('@/lib/domain/fulfilment')
    await openFulfilment(order.id)
    await openFulfilment(order.id)
    await openFulfilment(order.id)

    expect(await db.delivery.count({ where: { orderId: order.id } })).toBe(1)
    const events = await db.orderEvent.count({
      where: { orderId: order.id, type: 'SLOT_CONFIRMED' },
    })
    expect(events).toBe(1)
  })
})

describe('advancing a delivery', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedSettings()
    await seedLaunchCatalogue()
    const { invalidateSettings } = await import('@/lib/domain/settings')
    invalidateSettings()
  })

  async function scheduled() {
    const order = await paidOrder()
    const { openFulfilment } = await import('@/lib/domain/fulfilment')
    await openFulfilment(order.id)
    return order
  }

  it('walks SCHEDULED → PREPARING → OUT_FOR_DELIVERY → DELIVERED, moving the order with it', async () => {
    const order = await scheduled()
    const { applyDeliveryStatus } = await import('@/lib/domain/fulfilment')

    await applyDeliveryStatus({ orderId: order.id, status: 'PREPARING', actor: 'admin:owner' })
    await applyDeliveryStatus({
      orderId: order.id,
      status: 'OUT_FOR_DELIVERY',
      actor: 'admin:owner',
      courierRef: 'Own van — Ravi',
      actualCostCents: 800,
    })

    let row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { delivery: true },
    })
    expect(row.orderStatus).toBe('OUT_FOR_DELIVERY')
    expect(row.delivery?.dispatchedAt).not.toBeNull()
    expect(row.delivery?.courierRef).toBe('Own van — Ravi')
    expect(row.delivery?.actualCostCents).toBe(800)

    await applyDeliveryStatus({ orderId: order.id, status: 'DELIVERED', actor: 'admin:owner' })

    row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { delivery: true },
    })
    expect(row.orderStatus).toBe('DELIVERED')
    expect(row.delivery?.deliveredAt).not.toBeNull()
  })

  it('DISCARDS a status that would move the delivery backwards', async () => {
    const order = await scheduled()
    const { applyDeliveryStatus } = await import('@/lib/domain/fulfilment')
    await applyDeliveryStatus({ orderId: order.id, status: 'OUT_FOR_DELIVERY', actor: 'a' })

    const outcome = await applyDeliveryStatus({
      orderId: order.id,
      status: 'PREPARING',
      actor: 'a',
    })
    expect(outcome).toMatchObject({ kind: 'IGNORED_STALE', current: 'OUT_FOR_DELIVERY' })

    const row = await db.delivery.findUniqueOrThrow({ where: { orderId: order.id } })
    expect(row.deliveryStatus).toBe('OUT_FOR_DELIVERY')
  })

  it('REFUSES to un-deliver a delivered order', async () => {
    const order = await scheduled()
    const { applyDeliveryStatus } = await import('@/lib/domain/fulfilment')
    await applyDeliveryStatus({ orderId: order.id, status: 'DELIVERED', actor: 'a' })

    for (const status of ['FAILED', 'CANCELLED', 'OUT_FOR_DELIVERY'] as const) {
      const outcome = await applyDeliveryStatus({ orderId: order.id, status, actor: 'a' })
      expect(outcome.kind).toBe('IGNORED_STALE')
    }
    const row = await db.delivery.findUniqueOrThrow({ where: { orderId: order.id } })
    expect(row.deliveryStatus).toBe('DELIVERED')
  })

  it('treats the same status twice as a no-op, not an error', async () => {
    const order = await scheduled()
    const { applyDeliveryStatus } = await import('@/lib/domain/fulfilment')
    const outcome = await applyDeliveryStatus({
      orderId: order.id,
      status: 'SCHEDULED',
      actor: 'a',
    })
    expect(outcome).toMatchObject({ kind: 'IGNORED_UNCHANGED' })
  })

  it('a FAILED run returns the order to READY_FOR_DELIVERY — the goods still need to go out', async () => {
    const order = await scheduled()
    const { applyDeliveryStatus } = await import('@/lib/domain/fulfilment')
    await applyDeliveryStatus({
      orderId: order.id,
      status: 'FAILED',
      actor: 'admin:owner',
      failureReason: 'Nobody at the address',
    })

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { delivery: true },
    })
    expect(row.orderStatus).toBe('READY_FOR_DELIVERY')
    expect(row.delivery?.failureReason).toBe('Nobody at the address')
  })

  it('records the courier report WITHOUT forcing a refunded order back to life', async () => {
    const order = await scheduled()
    await db.order.update({ where: { id: order.id }, data: { orderStatus: 'REFUNDED' } })

    const { applyDeliveryStatus } = await import('@/lib/domain/fulfilment')
    await applyDeliveryStatus({ orderId: order.id, status: 'DELIVERED', actor: 'a' })

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { events: true },
    })
    expect(row.orderStatus).toBe('REFUNDED')
    expect(row.events.map((e) => e.type)).toContain('DELIVERY_DELIVERED_UNAPPLIED')
  })

  it('reports a missing delivery record rather than creating one by surprise', async () => {
    const order = await paidOrder()
    const { applyDeliveryStatus } = await import('@/lib/domain/fulfilment')
    expect(await applyDeliveryStatus({ orderId: order.id, status: 'DELIVERED', actor: 'a' })).toEqual(
      { kind: 'DELIVERY_NOT_FOUND' },
    )
  })
})

describe('rescheduling', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedSettings()
    await seedLaunchCatalogue()
    const { invalidateSettings } = await import('@/lib/domain/settings')
    invalidateSettings()
  })

  it('moves the slot and leaves a reason in the timeline', async () => {
    const order = await paidOrder()
    const { openFulfilment, rescheduleDelivery } = await import('@/lib/domain/fulfilment')
    await openFulfilment(order.id)

    const { availableSlots } = await import('@/lib/domain/delivery-slots')
    const later = availableSlots({ method: 'STANDARD', now: new Date() }).at(-1)!

    const result = await rescheduleDelivery({
      orderId: order.id,
      start: later.start,
      end: later.end,
      actor: 'admin:owner',
      reason: 'Van broke down',
    })
    expect(result.ok).toBe(true)

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { events: true },
    })
    expect(row.deliverySlotStart?.getTime()).toBe(later.start.getTime())
    const event = row.events.find((e) => e.type === 'SLOT_RESCHEDULED')
    expect((event!.detail as { reason: string }).reason).toBe('Van broke down')
  })

  it('REFUSES to reschedule something already delivered', async () => {
    const order = await paidOrder()
    const { openFulfilment, applyDeliveryStatus, rescheduleDelivery } = await import(
      '@/lib/domain/fulfilment'
    )
    await openFulfilment(order.id)
    await applyDeliveryStatus({ orderId: order.id, status: 'DELIVERED', actor: 'a' })

    const { availableSlots } = await import('@/lib/domain/delivery-slots')
    const later = availableSlots({ method: 'STANDARD', now: new Date() }).at(-1)!
    const result = await rescheduleDelivery({
      orderId: order.id,
      start: later.start,
      end: later.end,
      actor: 'admin:owner',
    })
    expect(result).toMatchObject({ ok: false, reason: 'ALREADY_DELIVERED' })
  })
})
