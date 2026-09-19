import 'server-only'
import { prisma } from '@/lib/db/client'
import { getSetting } from '@/lib/domain/settings'
import { transitionOrder } from '@/lib/domain/orders'
import { logger } from '@/lib/observability/logger'

/**
 * Blueprint §11.4 — expire unpaid orders.
 *
 * There is NOTHING to release: an unpaid order never held stock (§6.2). This
 * job exists only so the admin order list is not a graveyard of abandoned
 * checkouts.
 */
export async function expireStaleOrders(limit = 100): Promise<number> {
  const minutes = await getSetting('order_expiry_minutes')
  const cutoff = new Date(Date.now() - minutes * 60_000)

  const stale = await prisma.order.findMany({
    where: { orderStatus: 'PENDING_PAYMENT', createdAt: { lte: cutoff } },
    select: { id: true, reference: true },
    take: limit,
  })

  let expired = 0

  for (const order of stale) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.payment.updateMany({
          where: { orderId: order.id, paymentStatus: 'PENDING' },
          data: { paymentStatus: 'EXPIRED' },
        })
        await transitionOrder(tx, {
          orderId: order.id,
          from: 'PENDING_PAYMENT',
          to: 'CANCELLED',
          actor: 'job:expire',
          type: 'EXPIRED',
          detail: { afterMinutes: minutes },
          extra: { cancelledAt: new Date() },
        })
      })
      expired += 1
    } catch {
      // It was paid between the query and the write. Correct outcome: leave it.
    }
  }

  if (expired > 0) logger.info('expire.completed', { expired })
  return expired
}
