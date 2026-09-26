import { NextResponse } from 'next/server'
import { z } from 'zod'
import { env } from '@/lib/config/env'
import { verifyStripeSignature } from '@/lib/payments/signature'
import { parsePaymentIntent, snapshotOf } from '@/lib/payments/stripe'
import {
  claimWebhookEvent,
  settlePaidPayment,
  markPaymentFailed,
} from '@/lib/domain/payment-settlement'
import { runAfterPayment } from '@/lib/jobs/after-payment'
import { logger } from '@/lib/observability/logger'
import { clientIp } from '@/lib/http/ip'

/**
 * Blueprint §6.4 — WHERE PAYMENT BECOMES TRUE (GUARD-2).
 *
 * Node runtime, not edge: raw-body access and `timingSafeEqual` need it.
 * Returns 200 fast after committing; everything after is retryable.
 *
 * The rules this handler will not bend:
 *
 *  1. A request whose signature does not verify is a 401 and a security log
 *     entry. There is no fallback path, no "trust it if the reference looks
 *     right", and no development bypass compiled into the route.
 *  2. A message we understand but cannot act on returns 200. A 500 asks
 *     Stripe to redeliver something we will never understand, forever.
 *  3. Only `payment_intent.succeeded` settles an order, and only after the
 *     amount matches. The redirect the customer's browser follows proves
 *     nothing and settles nothing.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const eventEnvelope = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({ object: z.unknown() }),
})

export async function POST(request: Request) {
  const config = env()

  // 1. RAW body. The signature covers bytes — never re-serialise first.
  const rawBody = await request.text()

  // 2. Verify.
  const verdict = verifyStripeSignature({
    rawBody,
    header: request.headers.get('stripe-signature'),
    secret: config.STRIPE_WEBHOOK_SECRET,
  })

  if (!verdict.ok) {
    logger.critical('webhook.stripe.signature_rejected', {
      ip: clientIp(request),
      reason: verdict.reason,
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let envelope: z.infer<typeof eventEnvelope>
  try {
    const parsed = eventEnvelope.safeParse(JSON.parse(rawBody))
    if (!parsed.success) {
      logger.warn('webhook.stripe.unusable_envelope', {})
      return NextResponse.json({ received: true }, { status: 200 })
    }
    envelope = parsed.data
  } catch {
    logger.warn('webhook.stripe.malformed_json', {})
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // 3. Idempotency, enforced by a unique index rather than a check-then-act
  //    read. Stripe's own event id is the key, so a redelivery is a no-op.
  const claimed = await claimWebhookEvent({
    provider: 'stripe',
    eventId: envelope.id,
    rawBody,
  })
  if (!claimed) {
    logger.info('webhook.stripe.duplicate', { eventId: envelope.id, type: envelope.type })
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 })
  }

  const intent = parsePaymentIntent(envelope.data.object)

  // Events about anything other than a PaymentIntent are acknowledged and
  // ignored; the endpoint should not be subscribed to them in the first place.
  if (!intent) {
    logger.info('webhook.stripe.ignored_type', { eventId: envelope.id, type: envelope.type })
    return NextResponse.json({ received: true, ignored: envelope.type }, { status: 200 })
  }

  const snapshot = snapshotOf(intent)
  const reference = snapshot.reference

  if (!reference) {
    // 4. Understood but unusable — a PaymentIntent created outside this
    //    storefront, or one whose metadata was stripped. Loud, but 200.
    logger.critical('webhook.stripe.no_reference', {
      eventId: envelope.id,
      paymentIntentId: snapshot.id,
    })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  if (envelope.type === 'payment_intent.payment_failed') {
    await markPaymentFailed({ reference, status: 'FAILED', actor: 'webhook:stripe' })
    logger.info('webhook.stripe.failed', { eventId: envelope.id, reference })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  if (envelope.type === 'payment_intent.canceled') {
    // PayNow intents expire rather than fail: the QR goes stale unscanned.
    await markPaymentFailed({ reference, status: 'EXPIRED', actor: 'webhook:stripe' })
    logger.info('webhook.stripe.canceled', { eventId: envelope.id, reference })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  if (envelope.type !== 'payment_intent.succeeded') {
    logger.info('webhook.stripe.unhandled_type', { eventId: envelope.id, type: envelope.type })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // 5. The transaction. `amount_received` rather than `amount`: what actually
  //    arrived, not what was asked for.
  const outcome = await settlePaidPayment({
    reference,
    paidAmountCents: snapshot.amountReceivedCents,
    providerPaymentId: snapshot.chargeId,
    method: 'paynow',
    actor: 'webhook:stripe',
  })

  // 6. Fulfilment and notifications. Everything from here is retryable and
  //    none of it can fail the webhook.
  if (outcome.kind === 'PAID') {
    await runAfterPayment(outcome.orderId)
  } else if (outcome.kind === 'ORDER_NOT_FOUND') {
    logger.critical('webhook.stripe.order_not_found', { eventId: envelope.id, reference })
  }

  // 7. 200 fast.
  return NextResponse.json({ received: true, outcome: outcome.kind }, { status: 200 })
}
