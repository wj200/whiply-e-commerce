import {
  cents,
  addCents,
  subCents,
  mulCents,
  percentOf,
  minCents,
  ZERO,
  type Cents,
} from '@/lib/money'

/**
 * Blueprint §5.2 — THE ONLY PLACE A TOTAL IS PRODUCED.
 *
 * Pure, synchronous, no I/O. It takes products already loaded from the
 * database and a code already validated, and returns money. If a component
 * ever computes a total, that is a bug regardless of whether the number
 * happens to be right (§14.4).
 */

export type PriceableProduct = {
  id: string
  sku: string
  name: string
  slug: string
  priceCents: number
  imageUrl: string | null
  stockQty: number
  isActive: boolean
}

export type PriceableCode = {
  id: string
  code: string
  valueType: 'PERCENT' | 'FIXED'
  percentOff: number | null
  valueCents: number | null
}

export type PricingSettings = {
  deliveryFeeCents: number
  freeDeliveryThresholdCents: number
}

export type PricedLine = {
  productId: string
  sku: string
  name: string
  slug: string
  imageUrl: string | null
  unitPriceCents: Cents
  quantity: number
  lineTotalCents: Cents
}

export type PricedBasket = {
  lines: PricedLine[]
  subtotalCents: Cents
  discountCents: Cents
  deliveryFeeCents: Cents
  totalCents: Cents
  freeDeliveryApplied: boolean
  /** How much more is needed to reach free delivery. Zero once reached. */
  amountToFreeDeliveryCents: Cents
  appliedCode: { id: string; code: string } | null
}

export function computeTotals(input: {
  lines: { product: PriceableProduct; qty: number }[]
  code: PriceableCode | null
  settings: PricingSettings
}): PricedBasket {
  const { settings } = input

  // 1. Line totals.
  const lines: PricedLine[] = input.lines.map(({ product, qty }) => {
    const unitPriceCents = cents(product.priceCents)
    return {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      slug: product.slug,
      imageUrl: product.imageUrl,
      unitPriceCents,
      quantity: qty,
      lineTotalCents: mulCents(unitPriceCents, qty),
    }
  })

  // 2. Subtotal.
  const subtotalCents = addCents(...lines.map((l) => l.lineTotalCents))

  // 3. Discount.
  const discountCents = computeDiscount(subtotalCents, input.code)

  // 4. Subtotal after discount.
  const discounted = subCents(subtotalCents, discountCents)

  // 5. Delivery — assessed on the POST-DISCOUNT subtotal.
  //
  //    This is a business rule and it is stated here so it is never decided by
  //    accident in a component: a S$210 basket reduced to S$189 by a code pays
  //    the delivery fee, because it no longer reaches the threshold in revenue
  //    terms. Pinned by a unit test with exactly that scenario.
  const threshold = cents(settings.freeDeliveryThresholdCents)
  const freeDeliveryApplied = lines.length > 0 && discounted >= threshold
  const deliveryFeeCents =
    lines.length === 0 ? ZERO : freeDeliveryApplied ? ZERO : cents(settings.deliveryFeeCents)

  // 6. Total.
  const totalCents = addCents(discounted, deliveryFeeCents)

  const amountToFreeDeliveryCents =
    lines.length === 0 || freeDeliveryApplied ? ZERO : subCents(threshold, discounted)

  return {
    lines,
    subtotalCents,
    discountCents,
    deliveryFeeCents,
    totalCents,
    freeDeliveryApplied,
    amountToFreeDeliveryCents,
    appliedCode: input.code ? { id: input.code.id, code: input.code.code } : null,
  }
}

/**
 * A fixed-amount code can never exceed the goods, so a total can never go
 * below zero and a customer can never be owed money by a discount.
 */
function computeDiscount(subtotal: Cents, code: PriceableCode | null): Cents {
  if (!code) return ZERO
  if (subtotal <= 0) return ZERO

  if (code.valueType === 'PERCENT') {
    if (code.percentOff === null) return ZERO
    return percentOf(subtotal, code.percentOff)
  }

  if (code.valueCents === null) return ZERO
  return minCents(cents(code.valueCents), subtotal)
}

/** The invariants §10.3 asserts in the database, available to assert in code. */
export function assertBasketInvariants(basket: PricedBasket): void {
  const { subtotalCents, discountCents, deliveryFeeCents, totalCents } = basket
  if (totalCents !== subtotalCents - discountCents + deliveryFeeCents) {
    throw new Error('Basket arithmetic invariant violated')
  }
  if (discountCents > subtotalCents) throw new Error('Discount exceeds subtotal')
  if (totalCents < 0) throw new Error('Total is negative')
}
