import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Blueprint §6.4 step 2 / GUARD-2.
 *
 * HMAC over the RAW request body, compared in constant time. Two details here
 * are load-bearing and easy to get wrong:
 *
 *  1. The signature covers BYTES. Parsing the body first and re-serialising it
 *     changes key order and whitespace, and the signature will never match.
 *  2. The comparison must be timing-safe. A `===` on a hex digest leaks the
 *     digest one byte at a time to anyone willing to measure.
 */
export function computeHmacSha256(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
}

export function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false
  if (!secret) return false

  const expected = computeHmacSha256(rawBody, secret)
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature.trim().toLowerCase(), 'utf8')

  // timingSafeEqual throws on length mismatch, which would itself be a timing
  // signal; compare lengths first and still run the constant-time compare.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * HitPay's classic form-encoded callback signs the SORTED key=value pairs of
 * the payload with the `hmac` field removed, rather than the raw body. Both
 * shapes are supported so the handler works whichever the account is
 * configured for (§16.2 — verify against live documentation).
 */
export function verifyHitPayFormSignature(
  fields: Record<string, string>,
  salt: string,
): boolean {
  const provided = fields.hmac
  if (!provided) return false

  const rest = Object.entries(fields)
    .filter(([k]) => k !== 'hmac')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}${v}`)
    .join('')

  const expected = createHmac('sha256', salt).update(rest, 'utf8').digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(provided.trim().toLowerCase(), 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
