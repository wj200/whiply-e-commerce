import 'server-only'
import { prisma } from '@/lib/db/client'
import type { DeliveryStatus } from '@/lib/generated/prisma'
import { bookDelivery } from './delivery'
import { applyDeliveryStatus } from './delivery-status'
import { cancelOrder as cancelLalamoveOrder, LalamoveError } from '@/lib/delivery/lalamove'
import { transitionOrder, recordOrderEvent } from './orders'
import { requestQuotation } from '@/lib/delivery/lalamove'
import { getAllSettings } from './settings'
import { logger } from '@/lib/observability/logger'
import type { DispatchOutcome } from '@/lib/jobs/dispatch'

/**
 * Blueprint §7.8 / D5 — manual booking and off-platform deliveries.
 *
 * Manual booking runs the SAME functions, the SAME idempotency key and the
 * SAME audit trail as automatic dispatch. The only difference is who decided.
 * That is why manual mode is a fully tested path rather than a fallback
 * nobody exercises — and with the gate off (the default), it is the ONLY
 * path, so it had better work.
 */

/** Operator clicks "Book courier". Bypasses the gate; the human IS the gate. */
export async function bookDeliveryManually(input: {
  orderId: string
  actor: string
}): Promise<DispatchOutcome> {
  logger.info('delivery.manual_booking_requested', { orderId: input.orderId, actor: input.actor })
  return bookDelivery({ orderId: input.orderId, actor: input.actor })
}

/** Quotation preview shown before the operator confirms (§7.8). */
export async function previewQuotation(orderId: string): Promise<
  { ok: true; priceCents: number } | { ok: false; reason: string }
> {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) return { ok: false, reason: 'Order not found.' }

  const settings = await getAllSettings()
  const pickup = settings.pickup_address
  if (!pickup) {
    return { ok: false, reason: 'Warehouse pickup address is not set in Admin → Settings.' }
  }

  try {
    const quotation = await requestQuotation({
      pickup: {
        address: [pickup.line1, pickup.line2, `Singapore ${pickup.postalCode}`]
          .filter(Boolean)
          .join(', '),
        name: pickup.contactName,
        phone: pickup.contactPhone,
      },
      dropoff: {
        address: [order.addressLine1, order.addressLine2, `Singapore ${order.postalCode}`]
          .filter(Boolean)
          .join(', '),
        name: order.contactName,
        phone: order.contactPhone,
      },
      serviceType: settings.lalamove_vehicle_type,
    })
    return { ok: true, priceCents: quotation.priceCents }
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Could not obtain a quotation.',
    }
  }
}

/**
 * Record a delivery arranged OUTSIDE the platform — a courier booked by
 * phone, or an own-vehicle run.
 *
 * Without this escape hatch, the day Lalamove cannot take the job is the day
 * the system stops being able to describe reality (§7.8).
 */
export async function recordManualDelivery(input: {
  orderId: string
  actor: string
  reference: string
  actualCostCents: number | null
  note?: string
}): Promise<{ ok: boolean; reason?: string }> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { delivery: true },
  })
  if (!order) return { ok: false, reason: 'Order not found.' }
  if (order.delivery?.providerRef && order.delivery.provider === 'LALAMOVE') {
    return { ok: false, reason: 'This order already has a courier booking. Cancel it first.' }
  }

  // §19.2 — the documented path is PAID → PROCESSING → DELIVERY_BOOKED.
  // An off-platform delivery takes exactly the same route as a courier one.
  let statusBefore = order.orderStatus
  if (statusBefore === 'PAID') {
    await prisma.$transaction(async (tx) => {
      await transitionOrder(tx, {
        orderId: order.id,
        from: 'PAID',
        to: 'PROCESSING',
        actor: input.actor,
        type: 'PROCESSING',
      })
    })
    statusBefore = 'PROCESSING'
  }

  await prisma.$transaction(async (tx) => {
    await tx.delivery.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        provider: 'MANUAL',
        providerRef: input.reference,
        actualCostCents: input.actualCostCents,
        deliveryStatus: 'DRIVER_ASSIGNED',
        bookedAt: new Date(),
      },
      update: {
        provider: 'MANUAL',
        providerRef: input.reference,
        actualCostCents: input.actualCostCents,
        deliveryStatus: 'DRIVER_ASSIGNED',
        bookedAt: new Date(),
        failureReason: null,
      },
    })

    if (statusBefore !== 'DELIVERY_BOOKED') {
      await transitionOrder(tx, {
        orderId: order.id,
        from: statusBefore,
        to: 'DELIVERY_BOOKED',
        actor: input.actor,
        type: 'MANUAL_DELIVERY_RECORDED',
        detail: { reference: input.reference, note: input.note ?? null },
      })
    }
  })

  logger.info('delivery.manual_recorded', {
    reference: order.reference,
    providerRef: input.reference,
  })
  return { ok: true }
}

/**
 * Operator walks a manual delivery forward by hand. Goes through the SAME
 * guarded applier as a webhook, so ordering rules are identical.
 */
export async function advanceManualDelivery(input: {
  orderId: string
  status: DeliveryStatus
  actor: string
}): Promise<{ ok: boolean; reason?: string }> {
  const delivery = await prisma.delivery.findUnique({ where: { orderId: input.orderId } })
  if (!delivery) return { ok: false, reason: 'No delivery recorded for this order.' }
  if (!delivery.providerRef) return { ok: false, reason: 'This delivery has no reference yet.' }

  const outcome = await applyDeliveryStatus({
    providerRef: delivery.providerRef,
    status: input.status,
    actor: input.actor,
  })

  if (outcome.kind === 'IGNORED_STALE') {
    return { ok: false, reason: `Delivery is already ${outcome.current}.` }
  }
  return { ok: true }
}

/** Cancel a courier booking before pickup (§19.5). */
export async function cancelDeliveryBooking(input: {
  orderId: string
  actor: string
  reason: string
}): Promise<{ ok: boolean; reason?: string }> {
  const delivery = await prisma.delivery.findUnique({
    where: { orderId: input.orderId },
    include: { order: true },
  })
  if (!delivery?.providerRef) return { ok: false, reason: 'Nothing is booked for this order.' }
  if (['PICKED_UP', 'IN_TRANSIT', 'DELIVERED'].includes(delivery.deliveryStatus)) {
    return { ok: false, reason: 'The goods are already with the driver.' }
  }

  if (delivery.provider === 'LALAMOVE') {
    try {
      await cancelLalamoveOrder(delivery.providerRef)
    } catch (error) {
      const message = error instanceof LalamoveError ? error.message : 'Provider refused'
      return { ok: false, reason: `Could not cancel with the courier: ${message}` }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.delivery.update({
      where: { id: delivery.id },
      data: {
        deliveryStatus: 'CANCELLED',
        failureReason: input.reason,
        providerRef: null,
        quotationId: null,
        attempts: 0,
      },
    })

    if (delivery.order.orderStatus !== 'READY_FOR_DELIVERY') {
      await transitionOrder(tx, {
        orderId: delivery.orderId,
        from: delivery.order.orderStatus,
        to: 'READY_FOR_DELIVERY',
        actor: input.actor,
        type: 'DELIVERY_CANCELLED',
        detail: { reason: input.reason },
      })
    } else {
      await recordOrderEvent(tx, {
        orderId: delivery.orderId,
        type: 'DELIVERY_CANCELLED',
        actor: input.actor,
        detail: { reason: input.reason },
      })
    }
  })

  return { ok: true }
}
