import { NextResponse } from 'next/server'
import { env } from '@/lib/config/env'
import { verifySignature, verifyHitPayFormSignature } from '@/lib/payments/signature'
import {
  claimWebhookEvent,
  settlePaidPayment,
  markPaymentFailed,
} from '@/lib/domain/payment-settlement'
import { parseAmount, isPaidStatus, isFailedStatus, isExpiredStatus } from '@/lib/payments/hitpay'
import { enqueueDispatch } from '@/lib/jobs/dispatch'
import { logger } from '@/lib/observability/logger'
import { clientIp } from '@/lib/http/ip'

/**
 * Blueprint §6.4 — WHERE PAYMENT BECOMES TRUE (GUARD-2).
 *
 * Node runtime, not edge: raw-body access and timingSafeEqual need it.
 * Returns 200 fast after committing; everything after is retryable.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const config = env()

  // 1. RAW body. The signature covers bytes — never re-serialise first.
  const rawBody = await request.text()

  // 2. Verify. Both signature shapes are accepted (§16.2: confirm which your
  //    account uses). A mismatch is a 401 and a security log entry, never a
  //    fallback code path.
  const headerSignature =
    request.headers.get('x-signature') ??
    request.headers.get('hitpay-signature') ??
    request.headers.get('x-hitpay-signature')

  const fields = parseBody(rawBody, request.headers.get('content-type'))

  const signatureOk =
    verifySignature(rawBody, headerSignature, config.HITPAY_WEBHOOK_SALT) ||
    verifyHitPayFormSignature(fields, config.HITPAY_WEBHOOK_SALT)

  if (!signatureOk) {
    logger.critical('webhook.hitpay.signature_mismatch', {
      ip: clientIp(request),
      hasHeader: Boolean(headerSignature),
      hasHmacField: Boolean(fields.hmac),
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const reference = fields.reference_number ?? fields.reference
  const eventId =
    fields.payment_id ?? fields.payment_request_id ?? fields.id ?? (reference ? `ref:${reference}` : null)

  if (!eventId || !reference) {
    // 4. Understood but unusable. NEVER a 500 — a 500 asks HitPay to retry a
    //    message we will never understand.
    logger.warn('webhook.hitpay.unusable_payload', { hasReference: Boolean(reference) })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // 3. Idempotency, enforced by a unique index.
  const claimed = await claimWebhookEvent({ provider: 'hitpay', eventId, rawBody })
  if (!claimed) {
    logger.info('webhook.hitpay.duplicate', { eventId, reference })
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 })
  }

  const status = fields.status ?? ''

  if (isFailedStatus(status) || isExpiredStatus(status)) {
    await markPaymentFailed({
      reference,
      status: isExpiredStatus(status) ? 'EXPIRED' : 'FAILED',
      actor: 'webhook:hitpay',
    })
    logger.info('webhook.hitpay.not_paid', { eventId, reference, status })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  if (!isPaidStatus(status)) {
    logger.warn('webhook.hitpay.unknown_status', { eventId, reference, status })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  let paidAmountCents: number
  try {
    paidAmountCents = parseAmount(fields.amount ?? '')
  } catch {
    logger.error('webhook.hitpay.unparseable_amount', { eventId, reference })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // 7. The transaction.
  const outcome = await settlePaidPayment({
    reference,
    paidAmountCents,
    hitpayPaymentId: fields.payment_id ?? null,
    method: fields.payment_type ?? null,
    actor: 'webhook:hitpay',
  })

  // 8. Enqueue dispatch. Everything from here is retryable.
  if (outcome.kind === 'PAID') {
    await enqueueDispatch(outcome.orderId)
  } else if (outcome.kind === 'ORDER_NOT_FOUND') {
    logger.critical('webhook.hitpay.order_not_found', { eventId, reference })
  }

  // 9. 200 fast.
  return NextResponse.json({ received: true, outcome: outcome.kind }, { status: 200 })
}

/** HitPay may send form-encoded or JSON depending on the callback configured. */
function parseBody(raw: string, contentType: string | null): Record<string, string> {
  const isJson = (contentType ?? '').includes('application/json')

  if (isJson) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      return Object.fromEntries(
        Object.entries(parsed).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)]),
      )
    } catch {
      return {}
    }
  }

  return Object.fromEntries(new URLSearchParams(raw))
}
