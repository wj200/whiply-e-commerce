/**
 * Money in this system is ALWAYS integer cents, SGD.
 *
 * `Cents` is a branded type: a plain `number` cannot be passed where `Cents`
 * is expected without going through `cents()`, which validates it. That makes
 * "passed dollars where cents were expected" a compile error rather than a
 * 100x overcharge discovered by a customer.
 *
 * Formatting to "S$35.00" happens exactly once, at the render edge, via
 * `formatSgd()`. No other module may produce a currency string.
 */

declare const CENTS: unique symbol

export type Cents = number & { readonly [CENTS]: true }

export class MoneyError extends Error {}

/** Construct a Cents value. Throws on anything that is not a safe integer. */
export function cents(value: number): Cents {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`Money must be an integer number of cents, got ${value}`)
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`Money value is outside the safe integer range: ${value}`)
  }
  return value as Cents
}

export const ZERO: Cents = cents(0)

export function addCents(...values: Cents[]): Cents {
  return cents(values.reduce<number>((acc, v) => acc + v, 0))
}

export function subCents(a: Cents, b: Cents): Cents {
  return cents(a - b)
}

/** Multiply a unit price by a whole quantity. Quantity must be a positive integer. */
export function mulCents(unit: Cents, quantity: number): Cents {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new MoneyError(`Quantity must be a non-negative integer, got ${quantity}`)
  }
  return cents(unit * quantity)
}

/**
 * Apply an integer percentage, rounding DOWN.
 *
 * Rounding down is deliberate: on a discount it rounds in the customer's
 * favour on the amount charged, and it keeps the result deterministic.
 */
export function percentOf(amount: Cents, percent: number): Cents {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new MoneyError(`Percent must be an integer 0-100, got ${percent}`)
  }
  return cents(Math.floor((amount * percent) / 100))
}

export function minCents(a: Cents, b: Cents): Cents {
  return a <= b ? a : b
}

export function maxCents(a: Cents, b: Cents): Cents {
  return a >= b ? a : b
}

export function isNegative(a: Cents): boolean {
  return a < 0
}

/** Parse a decimal string like "35.00" or "35" into Cents. */
export function centsFromDecimalString(value: string): Cents {
  const trimmed = value.trim()
  if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new MoneyError(`Not a valid 2dp decimal amount: ${JSON.stringify(value)}`)
  }
  const negative = trimmed.startsWith('-')
  const [whole = '0', frac = ''] = trimmed.replace('-', '').split('.')
  const magnitude = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
  return cents(negative ? -magnitude : magnitude)
}

/**
 * Render Cents as a decimal string for a provider API ("110.00").
 * This is NOT for display — it carries no currency symbol on purpose.
 */
export function toDecimalString(amount: Cents): string {
  const negative = amount < 0
  const magnitude = Math.abs(amount)
  const whole = Math.floor(magnitude / 100)
  const frac = String(magnitude % 100).padStart(2, '0')
  return `${negative ? '-' : ''}${whole}.${frac}`
}

/**
 * The ONE place a currency string is produced for a human.
 * Whole amounts render without cents ("S$35"), matching the catalogue.
 */
export function formatSgd(amount: Cents, opts: { alwaysCents?: boolean } = {}): string {
  const negative = amount < 0
  const magnitude = Math.abs(amount)
  const whole = Math.floor(magnitude / 100)
  const remainder = magnitude % 100
  const body =
    remainder === 0 && !opts.alwaysCents
      ? whole.toLocaleString('en-SG')
      : `${whole.toLocaleString('en-SG')}.${String(remainder).padStart(2, '0')}`
  return `${negative ? '-' : ''}S$${body}`
}
