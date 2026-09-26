import 'server-only'
import { prisma } from '@/lib/db/client'
import { getPaymentIntent, isPaidIntentStatus, isFailedIntentStatus } from '@/lib/payments/stripe'
import { settlePaidPayment, markPaymentFailed } from '@/lib/domain/payment-settlement'
import { runAfterPayment } from './after-payment'
import { logger } from '@/lib/observability/logger'

/**
 * Blueprint §11.4 / §6.8 — the missed-webhook safety net.
 *
 * For orders stuck in PENDING_PAYMENT past 10 minutes, ask Stripe directly
 * and apply the SAME transition through the SAME function the webhook uses.
 * This is what makes a missed webhook a DELAY rather than a lost order.
 *
 * PayNow makes this more than theoretical: the customer leaves the site to
 * pay in their banking app, so there is no moment at which their browser
 * could tell us anything, and the webhook is the only channel there is.
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
      const intent = await getPaymentIntent(order.payment.requestId)

      if (isPaidIntentStatus(intent.status)) {
        const outcome = await settlePaidPayment({
          reference: order.reference,
          paidAmountCents: intent.amountReceivedCents,
          providerPaymentId: intent.chargeId,
          method: 'paynow',
          actor: 'job:reconcile',
        })
        if (outcome.kind === 'PAID') {
          settled += 1
          await runAfterPayment(outcome.orderId)
          logger.warn('reconcile.recovered_missed_webhook', { reference: order.reference })
        }
      } else if (isFailedIntentStatus(intent.status)) {
        // `canceled` is how an unscanned PayNow QR ends; anything else that
        // lands here needed a payment method it never got.
        await markPaymentFailed({
          reference: order.reference,
          status: intent.status === 'canceled' ? 'EXPIRED' : 'FAILED',
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
