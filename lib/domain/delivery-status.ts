import 'server-only'
import { prisma } from '@/lib/db/client'
import type { DeliveryStatus, OrderStatus } from '@/lib/generated/prisma'
import { transitionOrder, recordOrderEvent } from './orders'
import { logger } from '@/lib/observability/logger'

/**
 * Blueprint §7.4 / §19.5 — applying a courier status update.
 *
 * Transitions are GUARDED: a late PICKED_UP arriving after DELIVERED is
 * logged and discarded rather than un-delivering an order. This is the one
 * place delivery status is written, so ordering rules live in one function.
 */

/** Monotonic rank. A status may never move backwards. */
const RANK: Record<DeliveryStatus, number> = {
  NOT_BOOKED: 0,
  BOOKING: 1,
  DRIVER_ASSIGNED: 2,
  PICKED_UP: 3,
  IN_TRANSIT: 4,
  DELIVERED: 5,
  // Terminal-but-recoverable states sit outside the forward sequence.
  CANCELLED: 6,
  FAILED: 6,
}

/** Which order status each delivery status implies (§7.4). */
const ORDER_STATUS_FOR: Partial<Record<DeliveryStatus, OrderStatus>> = {
  BOOKING: 'DELIVERY_BOOKED',
  DRIVER_ASSIGNED: 'DELIVERY_BOOKED',
  PICKED_UP: 'OUT_FOR_DELIVERY',
  IN_TRANSIT: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  // A cancelled or failed delivery does NOT cancel the order: the goods
  // still need to go out, so it returns to READY_FOR_DELIVERY.
  CANCELLED: 'READY_FOR_DELIVERY',
  FAILED: 'READY_FOR_DELIVERY',
}

export type ApplyOutcome =
  | { kind: 'APPLIED'; from: DeliveryStatus; to: DeliveryStatus }
  | { kind: 'IGNORED_STALE'; current: DeliveryStatus; incoming: DeliveryStatus }
  | { kind: 'IGNORED_UNCHANGED'; current: DeliveryStatus }
  | { kind: 'DELIVERY_NOT_FOUND' }

export async function applyDeliveryStatus(input: {
  providerRef: string
  status: DeliveryStatus
  actor: string
  driver?: { name: string | null; phone: string | null; plateNumber: string | null } | null
  trackingUrl?: string | null
  actualCostCents?: number | null
}): Promise<ApplyOutcome> {
  const delivery = await prisma.delivery.findFirst({
    where: { providerRef: input.providerRef },
    include: { order: true },
  })

  if (!delivery) return { kind: 'DELIVERY_NOT_FOUND' }

  const current = delivery.deliveryStatus
  if (current === input.status) return { kind: 'IGNORED_UNCHANGED', current }

  // A delivery that has reached a terminal state, or one whose incoming
  // status ranks lower than the current one, is a replay or an out-of-order
  // delivery. Log and discard (§19.5).
  const goingBackwards = RANK[input.status] < RANK[current]
  const alreadyDelivered = current === 'DELIVERED' && input.status !== 'CANCELLED'

  if (goingBackwards || alreadyDelivered) {
    logger.warn('delivery.status_out_of_order', {
      providerRef: input.providerRef,
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
        ...(input.driver ? { driver: input.driver } : {}),
        ...(input.trackingUrl ? { trackingUrl: input.trackingUrl } : {}),
        ...(input.actualCostCents != null ? { actualCostCents: input.actualCostCents } : {}),
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
          detail: { providerRef: input.providerRef },
        })
      } catch {
        // The order is somewhere the state machine will not leave (REFUNDED,
        // CANCELLED). Record the courier's report without forcing the order.
        await recordOrderEvent(tx, {
          orderId: delivery.orderId,
          type: `DELIVERY_${input.status}_UNAPPLIED`,
          actor: input.actor,
          detail: { providerRef: input.providerRef, orderStatus: delivery.order.orderStatus },
        })
      }
    } else {
      await recordOrderEvent(tx, {
        orderId: delivery.orderId,
        type: `DELIVERY_${input.status}`,
        actor: input.actor,
        detail: { providerRef: input.providerRef },
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
