import 'server-only'
import { prisma } from '@/lib/db/client'
import { getAllSettings } from './settings'
import { transitionOrder, recordOrderEvent } from './orders'
import { logger } from '@/lib/observability/logger'
import type { DispatchOutcome } from '@/lib/jobs/dispatch'
import {
  requestQuotation,
  placeOrder,
  LalamoveError,
  type Stop,
} from '@/lib/delivery/lalamove'

/**
 * Blueprint §7.2 / §19.4 — the booking path.
 *
 * Automatic and manual dispatch converge HERE. The only difference between
 * them is who decided: the setting, or a person. Nothing about the booking
 * itself changes, which is why manual mode is a fully tested path rather
 * than a fallback nobody exercises.
 */

const BACKOFF_MS = [30_000, 120_000, 600_000]
const MAX_ATTEMPTS = 3

export async function bookDelivery(input: {
  orderId: string
  actor: string
}): Promise<DispatchOutcome> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { delivery: true, items: true },
  })

  if (!order) return { kind: 'NOT_DISPATCHABLE', status: 'MISSING' }
  if (order.delivery?.providerRef) return { kind: 'ALREADY_BOOKED' }

  const settings = await getAllSettings()
  const pickup = settings.pickup_address

  // A booking with no warehouse address fails LOUDLY with an operator-facing
  // message rather than silently sending a courier nowhere (§7.6).
  if (!pickup) {
    await blockDelivery(order.id, 'Warehouse pickup address is not set in Admin → Settings.')
    return { kind: 'BLOCKED', reason: 'PICKUP_ADDRESS_UNSET' }
  }

  const pickupStop: Stop = {
    address: [pickup.line1, pickup.line2, `Singapore ${pickup.postalCode}`]
      .filter(Boolean)
      .join(', '),
    name: pickup.contactName,
    phone: pickup.contactPhone,
  }

  const dropoffStop: Stop = {
    address: [order.addressLine1, order.addressLine2, `Singapore ${order.postalCode}`]
      .filter(Boolean)
      .join(', '),
    name: order.contactName,
    phone: order.contactPhone,
  }

  await prisma.delivery.upsert({
    where: { orderId: order.id },
    create: { orderId: order.id, deliveryStatus: 'BOOKING' },
    update: { deliveryStatus: 'BOOKING' },
  })

  // §19.2 — the documented flow is PAID → PROCESSING → DELIVERY_BOOKED.
  // A paid order is moved to PROCESSING ("picking") before a courier is
  // booked, so the state machine never has to allow a shortcut.
  let statusBeforeBooking = order.orderStatus
  if (statusBeforeBooking === 'PAID') {
    await prisma.$transaction(async (tx) => {
      await transitionOrder(tx, {
        orderId: order.id,
        from: 'PAID',
        to: 'PROCESSING',
        actor: input.actor,
        type: 'PROCESSING',
      })
    })
    statusBeforeBooking = 'PROCESSING'
  }

  try {
    const quotation = await requestQuotation({
      pickup: pickupStop,
      dropoff: dropoffStop,
      serviceType: settings.lalamove_vehicle_type,
    })

    // The internal cost is recorded against the order. It NEVER changes what
    // the customer was charged (§7.5).
    await prisma.delivery.update({
      where: { orderId: order.id },
      data: {
        quotationId: quotation.quotationId,
        estimatedCostCents: quotation.priceCents,
      },
    })

    const placed = await placeOrder({
      quotationId: quotation.quotationId,
      pickup: pickupStop,
      dropoff: dropoffStop,
      idempotencyKey: order.id, // §19.3 — one delivery per order, ever.
      remarks: order.instructions ?? undefined,
    })

    await prisma.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { orderId: order.id },
        data: {
          providerRef: placed.providerRef,
          actualCostCents: placed.priceCents ?? quotation.priceCents,
          trackingUrl: placed.shareLink,
          deliveryStatus: 'DRIVER_ASSIGNED',
          bookedAt: new Date(),
          failureReason: null,
        },
      })

      if (statusBeforeBooking !== 'DELIVERY_BOOKED') {
        await transitionOrder(tx, {
          orderId: order.id,
          from: statusBeforeBooking,
          to: 'DELIVERY_BOOKED',
          actor: input.actor,
          type: 'DELIVERY_BOOKED',
          detail: {
            providerRef: placed.providerRef,
            estimatedCostCents: quotation.priceCents,
            actualCostCents: placed.priceCents ?? quotation.priceCents,
          },
        })
      }
    })

    logger.info('delivery.booked', {
      reference: order.reference,
      providerRef: placed.providerRef,
      actualCostCents: placed.priceCents ?? quotation.priceCents,
    })

    return { kind: 'BOOKED', providerRef: placed.providerRef }
  } catch (error) {
    return handleBookingFailure(order.id, order.reference, statusBeforeBooking, error)
  }
}

async function handleBookingFailure(
  orderId: string,
  reference: string,
  currentStatus: string,
  error: unknown,
): Promise<DispatchOutcome> {
  const message = error instanceof Error ? error.message : 'Unknown courier error'
  const isAuth = error instanceof LalamoveError && error.isAuthError
  const retryable = error instanceof LalamoveError ? error.retryable : true

  if (isAuth) {
    // No retry storm. One alert; orders accumulate safely in READY_FOR_DELIVERY.
    await blockDelivery(orderId, 'Delivery provider credentials rejected.')
    logger.critical('delivery.credentials_rejected', { reference })
    return { kind: 'FAILED', reason: message, willRetry: false }
  }

  const delivery = await prisma.delivery.findUnique({ where: { orderId } })
  const attempts = (delivery?.attempts ?? 0) + 1
  const willRetry = retryable && attempts < MAX_ATTEMPTS

  await prisma.delivery.update({
    where: { orderId },
    data: {
      attempts,
      failureReason: message.slice(0, 500),
      deliveryStatus: willRetry ? 'BOOKING' : 'FAILED',
      nextAttemptAt: willRetry
        ? new Date(Date.now() + (BACKOFF_MS[attempts - 1] ?? 600_000))
        : null,
    },
  })

  if (!willRetry) {
    // A delivery failure must NEVER lose an order: it terminates at a state a
    // human can act on, with the reason attached (§7.7).
    await ensureReadyForDelivery(orderId, currentStatus, 'system:dispatch')
    logger.error('delivery.failed', { reference, attempts, message })
  } else {
    logger.warn('delivery.retrying', { reference, attempts, message })
  }

  return { kind: 'FAILED', reason: message, willRetry }
}

async function blockDelivery(orderId: string, reason: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) return

  await prisma.delivery.upsert({
    where: { orderId },
    create: { orderId, deliveryStatus: 'FAILED', failureReason: reason },
    update: { deliveryStatus: 'FAILED', failureReason: reason, nextAttemptAt: null },
  })

  await ensureReadyForDelivery(orderId, order.orderStatus, 'system:dispatch')

  await prisma.$transaction(async (tx) => {
    await recordOrderEvent(tx, {
      orderId,
      type: 'DELIVERY_BLOCKED',
      actor: 'system:dispatch',
      detail: { reason },
    })
  })

  logger.error('delivery.blocked', { reference: order.reference, reason })
}

async function ensureReadyForDelivery(
  orderId: string,
  currentStatus: string,
  actor: string,
): Promise<void> {
  if (currentStatus === 'READY_FOR_DELIVERY') return
  if (!['PAID', 'PROCESSING'].includes(currentStatus)) return

  await prisma.$transaction(async (tx) => {
    await transitionOrder(tx, {
      orderId,
      from: currentStatus as 'PAID' | 'PROCESSING',
      to: 'READY_FOR_DELIVERY',
      actor,
      type: 'AWAITING_MANUAL_BOOKING',
    })
  })
}
