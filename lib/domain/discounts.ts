import type { PriceableCode } from './pricing'

/**
 * Blueprint §5.4–5.6 — the discount engine.
 *
 * Simplified by instruction to exactly two VALUE types (percent, fixed) and
 * exactly two LIMIT types (time-limited, use-limited). There is deliberately
 * no minimum order, no maximum cap, no per-customer limit and no product or
 * category restriction — not in the validator, and not in the schema, which
 * is what keeps this to an ordered list of honest checks instead of a rules
 * engine (§17.4 records what adding one back would take).
 */

export type DiscountCodeRow = {
  id: string
  code: string
  valueType: 'PERCENT' | 'FIXED'
  percentOff: number | null
  valueCents: number | null
  limitType: 'TIME_LIMITED' | 'USE_LIMITED'
  startsAt: Date | null
  expiresAt: Date | null
  maxUses: number | null
  usesCount: number
  attributionLabel: string | null
  isActive: boolean
}

export type DiscountRejection =
  | 'NOT_FOUND'
  | 'INACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'FULLY_REDEEMED'
  | 'NO_EFFECT'

export type DiscountValidation =
  | { ok: true; code: PriceableCode; row: DiscountCodeRow }
  | { ok: false; reason: DiscountRejection; message: string }

/** Codes are stored uppercase; a customer typing `welcome10` gets the discount. */
export function normaliseCode(input: string): string {
  return input.trim().toUpperCase()
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Checks run in this order and STOP AT THE FIRST FAILURE, so the customer gets
 * the most specific true reason rather than a generic refusal (§5.5).
 *
 * `subtotalCents` is passed so the final "does this actually change anything"
 * check can run; it is NOT a minimum-order rule.
 */
export function validateDiscountCode(
  row: DiscountCodeRow | null,
  opts: { now: Date; subtotalCents: number },
): DiscountValidation {
  // 1. Exists
  if (!row) {
    return { ok: false, reason: 'NOT_FOUND', message: "That code isn't recognised." }
  }

  // 2. Active
  if (!row.isActive) {
    return { ok: false, reason: 'INACTIVE', message: 'That code is no longer active.' }
  }

  // 3. Started
  if (row.startsAt && row.startsAt > opts.now) {
    return { ok: false, reason: 'NOT_STARTED', message: "That code isn't active yet." }
  }

  // 4. Time-limited codes expire on a date.
  if (row.limitType === 'TIME_LIMITED') {
    if (!row.expiresAt || row.expiresAt <= opts.now) {
      return {
        ok: false,
        reason: 'EXPIRED',
        message: row.expiresAt
          ? `That code expired on ${formatDate(row.expiresAt)}.`
          : 'That code has expired.',
      }
    }
  }

  // 5. Use-limited codes expire after N redemptions.
  if (row.limitType === 'USE_LIMITED') {
    if (row.maxUses === null || row.usesCount >= row.maxUses) {
      return {
        ok: false,
        reason: 'FULLY_REDEEMED',
        message: 'That code has been fully redeemed.',
      }
    }
  }

  // 6. It must actually do something.
  const code: PriceableCode = {
    id: row.id,
    code: row.code,
    valueType: row.valueType,
    percentOff: row.percentOff,
    valueCents: row.valueCents,
  }

  if (previewDiscount(opts.subtotalCents, code) <= 0) {
    return {
      ok: false,
      reason: 'NO_EFFECT',
      message: "That code doesn't change this order's total.",
    }
  }

  return { ok: true, code, row }
}

/** Mirrors pricing.ts's discount rule; used only for the NO_EFFECT check. */
function previewDiscount(subtotalCents: number, code: PriceableCode): number {
  if (subtotalCents <= 0) return 0
  if (code.valueType === 'PERCENT') {
    if (code.percentOff === null) return 0
    return Math.floor((subtotalCents * code.percentOff) / 100)
  }
  if (code.valueCents === null) return 0
  return Math.min(code.valueCents, subtotalCents)
}

/** Human summary for the admin list, e.g. "10% off · expires 31 Dec 2026". */
export function describeCode(row: DiscountCodeRow): string {
  const value =
    row.valueType === 'PERCENT'
      ? `${row.percentOff}% off`
      : `S$${((row.valueCents ?? 0) / 100).toFixed(2)} off`
  const limit =
    row.limitType === 'TIME_LIMITED'
      ? row.expiresAt
        ? `expires ${formatDate(row.expiresAt)}`
        : 'expires (unset)'
      : `${row.usesCount}/${row.maxUses ?? 0} uses`
  return `${value} · ${limit}`
}
