import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Blueprint §6.4 step 2 / GUARD-2 — webhook signature verification.
 *
 * Two details here are load-bearing and easy to get wrong:
 *
 *  1. The signature covers BYTES. Parsing the body first and re-serialising it
 *     changes key order and whitespace, and the signature will never match.
 *  2. The comparison must be timing-safe. A `===` on a hex digest leaks the
 *     digest one byte at a time to anyone willing to measure.
 */
export function computeHmacSha256(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex')
}

function constantTimeEqualHex(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(provided.trim().toLowerCase(), 'utf8')
  // timingSafeEqual throws on length mismatch, which would itself be a timing
  // signal; compare lengths first and still run the constant-time compare.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export type StripeSignatureFailure =
  | 'MISSING_HEADER'
  | 'MALFORMED_HEADER'
  | 'NO_SECRET'
  | 'TIMESTAMP_OUT_OF_TOLERANCE'
  | 'DIGEST_MISMATCH'

export type StripeSignatureResult =
  | { ok: true; timestamp: number }
  | { ok: false; reason: StripeSignatureFailure }

/** Stripe's default tolerance. Five minutes, in seconds. */
export const STRIPE_TOLERANCE_SECONDS = 300

/**
 * Verifies a `Stripe-Signature` header.
 *
 * The header looks like `t=1699999999,v1=abc…,v1=def…`. The signed payload is
 * `${t}.${rawBody}`, HMAC-SHA256 with the endpoint's signing secret.
 *
 * The timestamp check is not decoration. Without it a signature captured once
 * stays valid forever, and an attacker who can replay a captured "succeeded"
 * body can re-drive settlement at will. (The webhook-event unique index makes
 * that a no-op today; that is defence in depth, not a reason to skip this.)
 *
 * Multiple `v1` values are accepted because Stripe sends one per active
 * secret during a secret rotation. Every candidate is compared in constant
 * time and the loop is not short-circuited on the first match.
 */
export function verifyStripeSignature(input: {
  rawBody: string
  header: string | null
  secret: string
  nowSeconds?: number
  toleranceSeconds?: number
}): StripeSignatureResult {
  if (!input.header) return { ok: false, reason: 'MISSING_HEADER' }
  if (!input.secret) return { ok: false, reason: 'NO_SECRET' }

  let timestamp: number | null = null
  const candidates: string[] = []

  for (const part of input.header.split(',')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key === 't') {
      const parsed = Number.parseInt(value, 10)
      if (Number.isFinite(parsed)) timestamp = parsed
    } else if (key === 'v1') {
      candidates.push(value)
    }
  }

  if (timestamp === null || candidates.length === 0) {
    return { ok: false, reason: 'MALFORMED_HEADER' }
  }

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  const tolerance = input.toleranceSeconds ?? STRIPE_TOLERANCE_SECONDS
  if (Math.abs(now - timestamp) > tolerance) {
    return { ok: false, reason: 'TIMESTAMP_OUT_OF_TOLERANCE' }
  }

  const expected = computeHmacSha256(`${timestamp}.${input.rawBody}`, input.secret)

  let matched = false
  for (const candidate of candidates) {
    // Deliberately not `||=` with short-circuit: every candidate is compared
    // so the work done does not depend on which secret matched.
    if (constantTimeEqualHex(expected, candidate)) matched = true
  }

  return matched ? { ok: true, timestamp } : { ok: false, reason: 'DIGEST_MISMATCH' }
}

/** Test helper and the shape the docs describe. */
export function buildStripeSignatureHeader(input: {
  rawBody: string
  secret: string
  timestamp: number
}): string {
  const v1 = computeHmacSha256(`${input.timestamp}.${input.rawBody}`, input.secret)
  return `t=${input.timestamp},v1=${v1}`
}
