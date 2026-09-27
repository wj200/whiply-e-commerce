import 'server-only'
import { prisma } from '@/lib/db/client'
import type { DeliveryStatus, OrderStatus } from '@/lib/generated/prisma'
import { transitionOrder, recordOrderEvent } from './orders'
import { logger } from '@/lib/observability/logger'

/**
 * Blueprint §7 — SELF-MANAGED FULFILMENT.
 *
 * There is no courier API. WHIPLY delivers its own orders, so a "delivery" is
 * a slot the customer booked and a status an operator advances by hand. The
 * courier integration this module replaces is gone entirely — not disabled
 * behind a flag — because a dispatch gate guarding a client that no longer
 * exists is a switch someone eventually flips to find out what it does.
 *
 * What survives from that design, because it was never really about couriers:
 *
 *  • ONE function writes delivery status, so the ordering rules live in one
 *    place and cannot be applied differently by two callers.
 *  • Status is MONOTONIC. A stale update arriving after a later one is logged
 *    and discarded rather than un-delivering an order.
 *  • The order status follows the delivery status, through the guarded
 *    transition path, never by a direct write.
 */

/** Monotonic rank. A delivery may never move backwards. */
const RANK: Record<DeliveryStatus, number> = {
  NOT_SCHEDULED: 0,
  SCHEDULED: 1,
  PREPARING: 2,
  OUT_FOR_DELIVERY: 3,
  DELIVERED: 4,
  // Terminal-but-recoverable states sit outside the forward sequence.
  CANCELLED: 5,
  FAILED: 5,
}

/** Which order status each delivery status implies (§7.4). */
const ORDER_STATUS_FOR: Partial<Record<DeliveryStatus, OrderStatus>> = {
  SCHEDULED: 'DELIVERY_BOOKED',
  PREPARING: 'DELIVERY_BOOKED',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  // A cancelled or failed run does NOT cancel the order: the goods still
  // need to go out, so it returns to READY_FOR_DELIVERY.
  CANCELLED: 'READY_FOR_DELIVERY',
  FAILED: 'READY_FOR_DELIVERY',
}

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  NOT_SCHEDULED: 'Not scheduled',
  SCHEDULED: 'Scheduled',
  PREPARING: 'Preparing',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  FAILED: 'Failed',
}

/** The statuses an operator may set by hand, in the order they occur. */
export const OPERATOR_SETTABLE: DeliveryStatus[] = [
  'SCHEDULED',
  'PREPARING',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
]

export type ApplyOutcome =
  | { kind: 'APPLIED'; from: DeliveryStatus; to: DeliveryStatus }
  | { kind: 'IGNORED_STALE'; current: DeliveryStatus; incoming: DeliveryStatus }
  | { kind: 'IGNORED_UNCHANGED'; current: DeliveryStatus }
  | { kind: 'DELIVERY_NOT_FOUND' }

/**
 * Opens the fulfilment record for a paid order. Called from the settlement
 * pipeline, and idempotent: a replayed webhook finds the row already there
 * and changes nothing.
 *
 * An order that booked a slot at checkout arrives here already SCHEDULED —
 * the customer chose the window and paid for it, so there is nothing left to
 * arrange. One without a slot (there is no such path today; the schema allows
 * it for admin-created orders) waits at NOT_SCHEDULED.
 */
export async function openFulfilment(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { delivery: true },
  })
  if (!order) return
  if (order.delivery) return

  const scheduled = order.deliverySlotStart !== null && order.deliverySlotEnd !== null

  await prisma.delivery.create({
    data: {
      orderId: order.id,
      deliveryStatus: scheduled ? 'SCHEDULED' : 'NOT_SCHEDULED',
    },
  })

  if (scheduled && order.orderStatus === 'PAID') {
    // PAID → DELIVERY_BOOKED is not a legal transition (§19.2); the order
    // passes through PROCESSING, which is also the truth of what happens —
    // someone has to pack it.
    await prisma.$transaction(async (tx) => {
      await transitionOrder(tx, {
        orderId: order.id,
        from: 'PAID',
        to: 'PROCESSING',
        actor: 'system:fulfilment',
        type: 'FULFILMENT_OPENED',
        detail: { slotStart: order.deliverySlotStart?.toISOString() ?? null },
      })
      await transitionOrder(tx, {
        orderId: order.id,
        from: 'PROCESSING',
        to: 'DELIVERY_BOOKED',
        actor: 'system:fulfilment',
        type: 'SLOT_CONFIRMED',
        detail: { slotEnd: order.deliverySlotEnd?.toISOString() ?? null },
      })
    })
  } else if (order.orderStatus === 'PAID') {
    await prisma.$transaction(async (tx) => {
      await transitionOrder(tx, {
        orderId: order.id,
        from: 'PAID',
        to: 'READY_FOR_DELIVERY',
        actor: 'system:fulfilment',
        type: 'AWAITING_SLOT',
      })
    })
  }

  logger.info('fulfilment.opened', { reference: order.reference, scheduled })
}

/**
 * The ONE place a delivery status is written.
 *
 * `actor` is the admin's email in the console and `system:*` for anything
 * automatic, so the order timeline always says who moved it.
 */
export async function applyDeliveryStatus(input: {
  orderId: string
  status: DeliveryStatus
  actor: string
  courierRef?: string | null
  notes?: string | null
  failureReason?: string | null
  actualCostCents?: number | null
}): Promise<ApplyOutcome> {
  const delivery = await prisma.delivery.findUnique({
    where: { orderId: input.orderId },
    include: { order: true },
  })

  if (!delivery) return { kind: 'DELIVERY_NOT_FOUND' }

  const current = delivery.deliveryStatus
  if (current === input.status) return { kind: 'IGNORED_UNCHANGED', current }

  // Going backwards, or resurrecting a delivered order, is a replay or a
  // mis-click. Log and discard (§19.5).
  const goingBackwards = RANK[input.status] < RANK[current]
  const alreadyDelivered = current === 'DELIVERED'

  if (goingBackwards || alreadyDelivered) {
    logger.warn('delivery.status_out_of_order', {
      orderId: input.orderId,
      current,
      incoming: input.status,
    })
    return { kind: 'IGNORED_STALE', current, incoming: input.status }
  }

  const nextOrderStatus = ORDER_STATUS_FOR[input.status]

  await prisma.$transaction(async (tx) => {
    await tx.delivery.update({
      where: { id: delivery.id },
      data: {
        deliveryStatus: input.status,
        ...(input.courierRef !== undefined ? { courierRef: input.courierRef } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.failureReason !== undefined ? { failureReason: input.failureReason } : {}),
        ...(input.actualCostCents != null ? { actualCostCents: input.actualCostCents } : {}),
        ...(input.status === 'OUT_FOR_DELIVERY' ? { dispatchedAt: new Date() } : {}),
        ...(input.status === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
      },
    })

    if (nextOrderStatus && nextOrderStatus !== delivery.order.orderStatus) {
      try {
        await transitionOrder(tx, {
          orderId: delivery.orderId,
          from: delivery.order.orderStatus,
          to: nextOrderStatus,
          actor: input.actor,
          type: `DELIVERY_${input.status}`,
          detail: { courierRef: input.courierRef ?? null },
        })
      } catch {
        // The order is somewhere the state machine will not leave (REFUNDED,
        // CANCELLED). Record the report without forcing the order.
        await recordOrderEvent(tx, {
          orderId: delivery.orderId,
          type: `DELIVERY_${input.status}_UNAPPLIED`,
          actor: input.actor,
          detail: { orderStatus: delivery.order.orderStatus },
        })
      }
    } else {
      await recordOrderEvent(tx, {
        orderId: delivery.orderId,
        type: `DELIVERY_${input.status}`,
        actor: input.actor,
        detail: { courierRef: input.courierRef ?? null },
      })
    }
  })

  logger.info('delivery.status_applied', {
    reference: delivery.order.reference,
    from: current,
    to: input.status,
  })

  return { kind: 'APPLIED', from: current, to: input.status }
}

/**
 * Moves a booked slot. The new window is validated by the caller against
 * `validateSlotChoice`; this records it and leaves a timeline entry, because
 * "why is this arriving on Thursday" must be answerable.
 */
export async function rescheduleDelivery(input: {
  orderId: string
  start: Date
  end: Date
  actor: string
  reason?: string
}): Promise<{ ok: boolean; reason?: string }> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { delivery: true },
  })
  if (!order) return { ok: false, reason: 'ORDER_NOT_FOUND' }
  if (order.delivery?.deliveryStatus === 'DELIVERED') {
    return { ok: false, reason: 'ALREADY_DELIVERED' }
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { deliverySlotStart: input.start, deliverySlotEnd: input.end },
    })
    await tx.delivery.upsert({
      where: { orderId: order.id },
      create: { orderId: order.id, deliveryStatus: 'SCHEDULED' },
      update: { deliveryStatus: 'SCHEDULED' },
    })
    await recordOrderEvent(tx, {
      orderId: order.id,
      type: 'SLOT_RESCHEDULED',
      actor: input.actor,
      detail: {
        from: order.deliverySlotStart?.toISOString() ?? null,
        to: input.start.toISOString(),
        reason: input.reason ?? null,
      },
    })
  })

  return { ok: true }
}
