import 'server-only'
import { z } from 'zod'
import { env } from '@/lib/config/env'
import { toDecimalString, centsFromDecimalString, type Cents } from '@/lib/money'

/**
 * Blueprint §6.3 — THE ONLY MODULE THAT KNOWS HITPAY'S API SHAPE.
 *
 * Field names, the base URL, the auth header and the webhook payload shape
 * must be checked against live HitPay documentation before launch (§16.2).
 * The architecture does not depend on them: it depends on three properties
 * that will not change — a server-side call creates a payment, our reference
 * travels with it, and a signed server-to-server callback reports the outcome.
 * A field rename is a one-file edit, right here.
 */

export class HitPayError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryable = false,
  ) {
    super(message)
    this.name = 'HitPayError'
  }
}

const paymentRequestResponse = z.object({
  id: z.string(),
  url: z.string().url(),
  status: z.string().optional(),
})

export type CreatePaymentRequestInput = {
  amount: Cents
  reference: string
  email: string
  name: string
  redirectUrl: string
  webhookUrl: string
}

export type CreatedPaymentRequest = {
  id: string
  url: string
}

const TIMEOUT_MS = 10_000
const RETRIES = 2

export async function createPaymentRequest(
  input: CreatePaymentRequestInput,
): Promise<CreatedPaymentRequest> {
  const config = env()

  const body = new URLSearchParams({
    amount: toDecimalString(input.amount),
    currency: 'SGD',
    reference_number: input.reference,
    email: input.email,
    name: input.name,
    purpose: `WHIPLY order ${input.reference}`,
    redirect_url: input.redirectUrl,
    webhook: input.webhookUrl,
    send_email: 'true',
  })

  const json = await request('/payment-requests', config, {
    method: 'POST',
    body,
  })

  const parsed = paymentRequestResponse.safeParse(json)
  if (!parsed.success) {
    throw new HitPayError('HitPay returned a payment request we could not read')
  }
  return { id: parsed.data.id, url: parsed.data.url }
}

const paymentStatusResponse = z.object({
  id: z.string(),
  status: z.string(),
  amount: z.union([z.string(), z.number()]).optional(),
  currency: z.string().optional(),
  payments: z
    .array(
      z.object({
        id: z.string(),
        status: z.string().optional(),
        payment_type: z.string().optional(),
        amount: z.union([z.string(), z.number()]).optional(),
      }),
    )
    .optional(),
})

export type PaymentRequestStatus = {
  requestId: string
  status: string
  paidAmountCents: Cents | null
  paymentId: string | null
  method: string | null
}

/** Used by the reconciliation job (§11.4) when a webhook never arrived. */
export async function getPaymentRequest(requestId: string): Promise<PaymentRequestStatus> {
  const config = env()
  const json = await request(`/payment-requests/${encodeURIComponent(requestId)}`, config, {
    method: 'GET',
  })

  const parsed = paymentStatusResponse.safeParse(json)
  if (!parsed.success) throw new HitPayError('HitPay returned a status we could not read')

  const completed = parsed.data.payments?.find((p) => isPaidStatus(p.status ?? ''))
  const amountRaw = completed?.amount ?? parsed.data.amount

  return {
    requestId: parsed.data.id,
    status: parsed.data.status,
    paidAmountCents: amountRaw === undefined ? null : parseAmount(amountRaw),
    paymentId: completed?.id ?? null,
    method: completed?.payment_type ?? null,
  }
}

export async function refundPayment(input: {
  paymentId: string
  amount: Cents
}): Promise<{ refundId: string }> {
  const config = env()
  const body = new URLSearchParams({
    payment_id: input.paymentId,
    amount: toDecimalString(input.amount),
  })
  const json = (await request('/refund', config, { method: 'POST', body })) as {
    id?: string
  }
  return { refundId: json.id ?? input.paymentId }
}

async function request(
  path: string,
  config: ReturnType<typeof env>,
  init: { method: string; body?: URLSearchParams },
): Promise<unknown> {
  const url = `${config.HITPAY_API_BASE.replace(/\/$/, '')}${path}`
  let lastError: unknown

  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: init.method,
        headers: {
          'X-BUSINESS-API-KEY': config.HITPAY_API_KEY,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: init.body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })

      if (res.status >= 500 || res.status === 429) {
        throw new HitPayError(`HitPay ${res.status}`, res.status, true)
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new HitPayError(`HitPay ${res.status}: ${text.slice(0, 200)}`, res.status, false)
      }
      return await res.json()
    } catch (error) {
      lastError = error
      const retryable = error instanceof HitPayError ? error.retryable : true
      if (!retryable || attempt === RETRIES) break
      await sleep(250 * 2 ** attempt)
    }
  }

  if (lastError instanceof HitPayError) throw lastError
  throw new HitPayError('Could not reach HitPay', undefined, true)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function parseAmount(raw: string | number): Cents {
  return centsFromDecimalString(typeof raw === 'number' ? raw.toFixed(2) : raw)
}

export function isPaidStatus(status: string): boolean {
  return ['completed', 'succeeded', 'paid'].includes(status.trim().toLowerCase())
}

export function isFailedStatus(status: string): boolean {
  return ['failed', 'cancelled', 'canceled'].includes(status.trim().toLowerCase())
}

export function isExpiredStatus(status: string): boolean {
  return ['expired'].includes(status.trim().toLowerCase())
}
