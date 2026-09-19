import 'server-only'
import { prisma } from '@/lib/db/client'
import { getOrder, getDriver, mapLalamoveStatus } from '@/lib/delivery/lalamove'
import { applyDeliveryStatus } from '@/lib/domain/delivery-status'
import { logger } from '@/lib/observability/logger'

/**
 * Blueprint §11.4 / D6 — the quiet-delivery safety net.
 *
 * Webhooks do not cover everything and can arrive late or not at all. For
 * ACTIVE deliveries with no update in 30 minutes, poll the provider and apply
 * the same mapping through the same guarded function the webhook uses.
 */
const STALE_AFTER_MINUTES = 30

const ACTIVE_STATUSES = ['BOOKING', 'DRIVER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] as const

export async function reconcileDeliveries(limit = 25): Promise<{
  checked: number
  updated: number
}> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MINUTES * 60_000)

  const stale = await prisma.delivery.findMany({
    where: {
      provider: 'LALAMOVE',
      providerRef: { not: null },
      deliveryStatus: { in: [...ACTIVE_STATUSES] },
      updatedAt: { lte: cutoff },
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  })

  let updated = 0

  for (const delivery of stale) {
    if (!delivery.providerRef) continue

    try {
      const remote = await getOrder(delivery.providerRef)
      const mapped = mapLalamoveStatus(remote.status)

      if (!mapped) {
        logger.warn('reconcile.delivery.unmapped_status', {
          providerRef: delivery.providerRef,
          rawStatus: remote.status,
        })
        // Touch the row so a permanently unmapped status is not re-polled
        // every fifteen minutes forever.
        await prisma.delivery.update({
          where: { id: delivery.id },
          data: { updatedAt: new Date() },
        })
        continue
      }

      let driver = null
      if (remote.driverId && mapped !== 'BOOKING') {
        try {
          driver = await getDriver(delivery.providerRef, remote.driverId)
        } catch {
          /* driver details are a nicety, never a reason to fail the sweep */
        }
      }

      const outcome = await applyDeliveryStatus({
        providerRef: delivery.providerRef,
        status: mapped,
        actor: 'job:reconcile-delivery',
        driver,
        trackingUrl: remote.shareLink,
        actualCostCents: remote.priceCents,
      })

      if (outcome.kind === 'APPLIED') {
        updated += 1
        logger.warn('reconcile.delivery.recovered', {
          providerRef: delivery.providerRef,
          from: outcome.from,
          to: outcome.to,
        })
      } else {
        await prisma.delivery.update({
          where: { id: delivery.id },
          data: { updatedAt: new Date() },
        })
      }
    } catch (error) {
      logger.error('reconcile.delivery.failed', {
        providerRef: delivery.providerRef,
        message: error instanceof Error ? error.message : 'unknown',
      })
    }
  }

  return { checked: stale.length, updated }
}
