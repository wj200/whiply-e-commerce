import 'server-only'
import { prisma } from '@/lib/db/client'
import { getSetting } from '@/lib/domain/settings'
import { transitionOrder } from '@/lib/domain/orders'
import { logger } from '@/lib/observability/logger'

/**
 * Blueprint §7.1 / §19.4 / GUARD-3 — THE DISPATCH GATE.
 *
 * This module is built BEFORE any courier client exists, deliberately: a
 * safety switch retrofitted onto working code is a switch someone will be
 * tempted to bypass "just for testing".
 *
 * With `auto_dispatch_enabled` false — the shipped default — a paid order
 * becomes READY_FOR_DELIVERY and NO courier module is even imported. That is
 * asserted by an integration test that fails if the import ever happens.
 */

export type DispatchOutcome =
  | { kind: 'GATE_OFF' }
  | { kind: 'NOT_DISPATCHABLE'; status: string }
  | { kind: 'ALREADY_BOOKED' }
  | { kind: 'BLOCKED'; reason: string }
  | { kind: 'BOOKED'; providerRef: string }
  | { kind: 'FAILED'; reason: string; willRetry: boolean }

/**
 * Enqueue is a row + an immediate best-effort run. The 5-minute cron sweep
 * (§11.4) catches anything whose immediate invocation was lost, which is what
 * makes a cron-driven design acceptable for work this important.
 */
export async function enqueueDispatch(orderId: string): Promise<void> {
  await prisma.delivery.upsert({
    where: { orderId },
    create: { orderId, deliveryStatus: 'NOT_BOOKED', nextAttemptAt: new Date() },
    update: { nextAttemptAt: new Date() },
  })

  // Run now, but never let a courier problem fail the payment webhook.
  try {
    await runDispatch(orderId)
  } catch (error) {
    logger.error('dispatch.enqueue_run_failed', {
      orderId,
      message: error instanceof Error ? error.message : 'unknown',
    })
  }
}

export async function runDispatch(orderId: string): Promise<DispatchOutcome> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { delivery: true },
  })

  if (!order) return { kind: 'NOT_DISPATCHABLE', status: 'MISSING' }

  // Already booked is checked FIRST: an order with a provider reference is
  // booked whatever its current status, and a late re-run must report that
  // rather than "not dispatchable".
  if (order.delivery?.providerRef) return { kind: 'ALREADY_BOOKED' }

  if (!['PAID', 'PROCESSING', 'READY_FOR_DELIVERY'].includes(order.orderStatus)) {
    return { kind: 'NOT_DISPATCHABLE', status: order.orderStatus }
  }

  // ────────────────────────────────────────────────────────────────────
  // GUARD-3. Read the gate before ANYTHING else happens.
  // ────────────────────────────────────────────────────────────────────
  const autoDispatch = await getSetting('auto_dispatch_enabled')

  if (!autoDispatch) {
    // A paid order always has a delivery record, even when nothing is booked,
    // so the deliveries view shows it waiting rather than showing nothing.
    await prisma.delivery.upsert({
      where: { orderId: order.id },
      create: { orderId: order.id, deliveryStatus: 'NOT_BOOKED' },
      update: {},
    })

    if (order.orderStatus !== 'READY_FOR_DELIVERY') {
      await prisma.$transaction(async (tx) => {
        await transitionOrder(tx, {
          orderId: order.id,
          from: order.orderStatus,
          to: 'READY_FOR_DELIVERY',
          actor: 'system:dispatch-gate',
          type: 'GATE_OFF',
          detail: { reason: 'auto_dispatch_enabled is false' },
        })
      })
    }
    logger.info('dispatch.gate_off', { reference: order.reference })
    // No courier module is imported on this path. That is the point.
    return { kind: 'GATE_OFF' }
  }

  // Gate is ON. Only now is the courier path loaded, dynamically, so the
  // OFF path provably cannot reach it.
  const { bookDelivery } = await import('@/lib/domain/delivery')
  return bookDelivery({ orderId: order.id, actor: 'system:dispatch' })
}

/** The 5-minute sweep: anything queued whose immediate run never happened. */
export async function sweepPendingDispatches(limit = 20): Promise<number> {
  const due = await prisma.delivery.findMany({
    where: {
      providerRef: null,
      deliveryStatus: { in: ['NOT_BOOKED', 'BOOKING'] },
      nextAttemptAt: { lte: new Date() },
      order: { orderStatus: { in: ['PAID', 'PROCESSING'] } },
    },
    select: { orderId: true },
    take: limit,
  })

  for (const row of due) {
    try {
      await runDispatch(row.orderId)
    } catch (error) {
      logger.error('dispatch.sweep_failed', {
        orderId: row.orderId,
        message: error instanceof Error ? error.message : 'unknown',
      })
    }
  }

  return due.length
}
