import 'server-only'
import { z } from 'zod'
import { env } from '@/lib/config/env'
import { type Cents } from '@/lib/money'

/**
 * Blueprint §6.3 — THE ONLY MODULE THAT KNOWS STRIPE'S API SHAPE.
 *
 * WHIPLY takes exactly one payment method: PayNow. Not "PayNow first" and not
 * "PayNow plus cards" — `payment_method_types` is a one-element array and
 * there is no code path that widens it. A card cannot be presented to this
 * integration even by a client that asks for one, because the client never
 * gets to name a method: the PaymentIntent is created and confirmed
 * server-side in a single call and the customer is sent to the QR page Stripe
 * hosts for it.
 *
 * Consequences of that choice, stated here so they are not rediscovered in
 * production:
 *
 *  • No card data ever reaches our servers, our logs, or our database. The
 *    only payment identifiers we store are Stripe's own opaque ids.
 *  • PayNow is a push method. The customer scans, then pays in their banking
 *    app. `createPaymentIntent` therefore returns while the intent is still
 *    `requires_action`; payment becomes TRUE only in the webhook (§6.4).
 *  • Settlement is to the Stripe balance and then to the bank account on the
 *    Stripe account, NOT to a personal PayNow handle. See docs/CREDENTIALS.md.
 *
 * Raw REST over `fetch` rather than the SDK: the surface we use is four
 * endpoints, and this keeps the server bundle free of a dependency whose own
 * retry and telemetry behaviour we would then have to reason about.
 */

export class StripeError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryable = false,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'StripeError'
  }
}

const TIMEOUT_MS = 12_000
const RETRIES = 2

/** Stripe speaks the smallest currency unit, which for SGD is already cents. */
function toStripeAmount(amount: Cents): string {
  return String(amount)
}

const nextAction = z
  .object({
    type: z.string(),
    paynow_display_qr_code: z
      .object({
        data: z.string().optional(),
        hosted_instructions_url: z.string().url().optional(),
        image_url_png: z.string().url().optional(),
        image_url_svg: z.string().url().optional(),
      })
      .optional(),
  })
  .nullable()
  .optional()

const paymentIntentShape = z.object({
  id: z.string(),
  object: z.literal('payment_intent').optional(),
  status: z.string(),
  amount: z.number(),
  amount_received: z.number().optional(),
  currency: z.string(),
  latest_charge: z.union([z.string(), z.object({ id: z.string() })]).nullable().optional(),
  next_action: nextAction,
  metadata: z.record(z.string()).optional(),
})

export type StripePaymentIntent = z.infer<typeof paymentIntentShape>

export type CreatedPaymentIntent = {
  /** pi_… — stored as `payments.request_id`. */
  id: string
  status: string
  /** Stripe-hosted PayNow QR page. This is where the customer is sent. */
  hostedInstructionsUrl: string | null
  qrImageUrl: string | null
}

export type CreatePaymentIntentInput = {
  amount: Cents
  reference: string
  email: string
  name: string
  /** Where Stripe sends the customer once the QR page is done with them. */
  returnUrl: string
}

export async function createPaymentIntent(
  input: CreatePaymentIntentInput,
): Promise<CreatedPaymentIntent> {
  const body = new URLSearchParams({
    amount: toStripeAmount(input.amount),
    currency: 'sgd',
    'payment_method_types[0]': 'paynow',
    'payment_method_data[type]': 'paynow',
    confirm: 'true',
    // Stripe redirects the customer back here from the hosted QR page.
    return_url: input.returnUrl,
    description: `WHIPLY order ${input.reference}`,
    // The reference travels with the payment, so a webhook can find the order
    // even if every other correlation fails.
    'metadata[reference]': input.reference,
    'metadata[source]': 'whiply-storefront',
    receipt_email: input.email,
  })

  // Stripe deduplicates on this key for 24h, so a retried request after a
  // timeout re-reads the first intent instead of creating a second one.
  const json = await request('/v1/payment_intents', {
    method: 'POST',
    body,
    idempotencyKey: `pi:${input.reference}`,
  })

  const parsed = paymentIntentShape.safeParse(json)
  if (!parsed.success) {
    throw new StripeError('Stripe returned a PaymentIntent we could not read')
  }

  const qr = parsed.data.next_action?.paynow_display_qr_code
  return {
    id: parsed.data.id,
    status: parsed.data.status,
    hostedInstructionsUrl: qr?.hosted_instructions_url ?? null,
    qrImageUrl: qr?.image_url_png ?? null,
  }
}

export type PaymentIntentSnapshot = {
  id: string
  status: string
  amountCents: number
  amountReceivedCents: number
  chargeId: string | null
  reference: string | null
}

/** Used by the reconciliation job (§11.4) when a webhook never arrived. */
export async function getPaymentIntent(id: string): Promise<PaymentIntentSnapshot> {
  const json = await request(`/v1/payment_intents/${encodeURIComponent(id)}`, { method: 'GET' })
  const parsed = paymentIntentShape.safeParse(json)
  if (!parsed.success) throw new StripeError('Stripe returned a status we could not read')
  return snapshotOf(parsed.data)
}

export function snapshotOf(intent: StripePaymentIntent): PaymentIntentSnapshot {
  const charge = intent.latest_charge
  return {
    id: intent.id,
    status: intent.status,
    amountCents: intent.amount,
    amountReceivedCents: intent.amount_received ?? 0,
    chargeId: typeof charge === 'string' ? charge : (charge?.id ?? null),
    reference: intent.metadata?.reference ?? null,
  }
}

export function parsePaymentIntent(raw: unknown): StripePaymentIntent | null {
  const parsed = paymentIntentShape.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export async function refundPaymentIntent(input: {
  paymentIntentId: string
  amount: Cents
  reason?: 'requested_by_customer' | 'duplicate' | 'fraudulent'
  idempotencyKey?: string
}): Promise<{ refundId: string; status: string }> {
  const body = new URLSearchParams({
    payment_intent: input.paymentIntentId,
    amount: toStripeAmount(input.amount),
  })
  if (input.reason) body.set('reason', input.reason)

  const json = (await request('/v1/refunds', {
    method: 'POST',
    body,
    idempotencyKey: input.idempotencyKey,
  })) as { id?: string; status?: string }

  return { refundId: json.id ?? input.paymentIntentId, status: json.status ?? 'unknown' }
}

async function request(
  path: string,
  init: { method: string; body?: URLSearchParams; idempotencyKey?: string },
): Promise<unknown> {
  const config = env()
  const url = `${config.STRIPE_API_BASE.replace(/\/$/, '')}${path}`
  let lastError: unknown

  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${config.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'Stripe-Version': STRIPE_API_VERSION,
      }
      if (init.idempotencyKey) headers['Idempotency-Key'] = init.idempotencyKey

      const res = await fetch(url, {
        method: init.method,
        headers,
        body: init.body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })

      if (res.status >= 500 || res.status === 429) {
        throw new StripeError(`Stripe ${res.status}`, res.status, true)
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new StripeError(
          `Stripe ${res.status}: ${text.slice(0, 300)}`,
          res.status,
          false,
          errorCodeOf(text),
        )
      }
      return await res.json()
    } catch (error) {
      lastError = error
      const retryable = error instanceof StripeError ? error.retryable : true
      if (!retryable || attempt === RETRIES) break
      await sleep(300 * 2 ** attempt)
    }
  }

  if (lastError instanceof StripeError) throw lastError
  throw new StripeError('Could not reach Stripe', undefined, true)
}

/**
 * Pinned rather than floating. An account-level API version bump is a change
 * we want to make deliberately, with the webhook payload shapes re-read.
 */
export const STRIPE_API_VERSION = '2025-08-27.basil'

function errorCodeOf(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text) as { error?: { code?: string } }
    return parsed.error?.code
  } catch {
    return undefined
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** PayNow intents that have settled. */
export function isPaidIntentStatus(status: string): boolean {
  return status === 'succeeded'
}

export function isFailedIntentStatus(status: string): boolean {
  return status === 'canceled' || status === 'requires_payment_method'
}
