import { z } from 'zod'

/**
 * Blueprint §5.1 — THE CART CARRIES NO PRICES.
 *
 * It is a list of {sku, qty} and a schema version, held in localStorage.
 * There is no field in which a price could be written, which is why a tampered
 * cart can only ever change WHAT is bought, never FOR HOW MUCH (GUARD-1).
 */

export const CART_STORAGE_KEY = 'whiply.cart.v1'
export const CART_SCHEMA_VERSION = 1

export const MAX_QTY_PER_LINE = 99
export const MAX_LINES = 20

export const cartLineSchema = z.object({
  sku: z.string().min(1).max(64),
  qty: z.number().int().min(1).max(MAX_QTY_PER_LINE),
})

export const cartSchema = z.object({
  v: z.literal(CART_SCHEMA_VERSION),
  lines: z.array(cartLineSchema).max(MAX_LINES),
})

export type CartLine = z.infer<typeof cartLineSchema>
export type Cart = z.infer<typeof cartSchema>

export const EMPTY_CART: Cart = { v: CART_SCHEMA_VERSION, lines: [] }

/**
 * Read a cart from untrusted storage. Anything unparseable — including a cart
 * written by an older schema version, or one edited by hand to add a price —
 * is discarded rather than repaired.
 */
export function parseStoredCart(raw: string | null): Cart {
  if (!raw) return EMPTY_CART
  try {
    const parsed = cartSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return EMPTY_CART
    return dedupeLines(parsed.data)
  } catch {
    return EMPTY_CART
  }
}

/** Two lines for one SKU is a bug somewhere; collapse rather than double-charge. */
export function dedupeLines(cart: Cart): Cart {
  const totals = new Map<string, number>()
  for (const line of cart.lines) {
    totals.set(line.sku, Math.min((totals.get(line.sku) ?? 0) + line.qty, MAX_QTY_PER_LINE))
  }
  return {
    v: CART_SCHEMA_VERSION,
    lines: [...totals.entries()].map(([sku, qty]) => ({ sku, qty })),
  }
}

export function addLine(cart: Cart, sku: string, qty: number): Cart {
  if (!Number.isInteger(qty) || qty < 1) return cart
  const existing = cart.lines.find((l) => l.sku === sku)
  if (existing) {
    return setLineQty(cart, sku, Math.min(existing.qty + qty, MAX_QTY_PER_LINE))
  }
  if (cart.lines.length >= MAX_LINES) return cart
  return {
    v: CART_SCHEMA_VERSION,
    lines: [...cart.lines, { sku, qty: Math.min(qty, MAX_QTY_PER_LINE) }],
  }
}

export function setLineQty(cart: Cart, sku: string, qty: number): Cart {
  if (qty <= 0) return removeLine(cart, sku)
  const clamped = Math.min(Math.floor(qty), MAX_QTY_PER_LINE)
  return {
    v: CART_SCHEMA_VERSION,
    lines: cart.lines.map((l) => (l.sku === sku ? { sku, qty: clamped } : l)),
  }
}

export function removeLine(cart: Cart, sku: string): Cart {
  return { v: CART_SCHEMA_VERSION, lines: cart.lines.filter((l) => l.sku !== sku) }
}

export function replaceWithSingle(sku: string, qty: number): Cart {
  return addLine(EMPTY_CART, sku, qty)
}

export function itemCount(cart: Cart): number {
  return cart.lines.reduce((n, l) => n + l.qty, 0)
}
