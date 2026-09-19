import 'server-only'
import { prisma } from '@/lib/db/client'
import { getPaymentRequest, isPaidStatus, isFailedStatus, isExpiredStatus } from '@/lib/payments/hitpay'
import { settlePaidPayment, markPaymentFailed } from '@/lib/domain/payment-settlement'
import { enqueueDispatch } from './dispatch'
import { logger } from '@/lib/observability/logger'

/**
 * Blueprint §11.4 / §6.8 — the missed-webhook safety net.
 *
 * For orders stuck in PENDING_PAYMENT past 10 minutes, ask HitPay directly and
 * apply the SAME transition through the SAME function the webhook uses. This
 * is what makes a missed webhook a DELAY rather than a lost order.
 */
const STALE_AFTER_MINUTES = 10

export async function reconcilePayments(limit = 25): Promise<{ checked: number; settled: number }> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MINUTES * 60_000)

  const stale = await prisma.order.findMany({
    where: {
      orderStatus: 'PENDING_PAYMENT',
      createdAt: { lte: cutoff },
      payment: { paymentStatus: 'PENDING' },
    },
    include: { payment: true },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })

  let settled = 0

  for (const order of stale) {
    if (!order.payment) continue

    try {
      const status = await getPaymentRequest(order.payment.requestId)

      if (isPaidStatus(status.status) && status.paidAmountCents !== null) {
        const outcome = await settlePaidPayment({
          reference: order.reference,
          paidAmountCents: status.paidAmountCents,
          hitpayPaymentId: status.paymentId,
          method: status.method,
          actor: 'job:reconcile',
        })
        if (outcome.kind === 'PAID') {
          settled += 1
          await enqueueDispatch(outcome.orderId)
          logger.warn('reconcile.recovered_missed_webhook', { reference: order.reference })
        }
      } else if (isFailedStatus(status.status) || isExpiredStatus(status.status)) {
        await markPaymentFailed({
          reference: order.reference,
          status: isExpiredStatus(status.status) ? 'EXPIRED' : 'FAILED',
          actor: 'job:reconcile',
        })
      }
    } catch (error) {
      logger.error('reconcile.failed', {
        reference: order.reference,
        message: error instanceof Error ? error.message : 'unknown',
      })
    }
  }

  return { checked: stale.length, settled }
}
