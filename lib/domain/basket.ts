import 'server-only'
import { prisma } from '@/lib/db/client'
import { getPricingSettings } from './settings'
import { computeTotals, type PricedBasket, type PriceableProduct } from './pricing'
import { validateDiscountCode, normaliseCode, type DiscountValidation } from './discounts'
import type { CartLine } from '@/lib/cart/types'

/**
 * Blueprint §5.1 / GUARD-1 — the server re-prices EVERY basket from the
 * database. The client sends {sku, qty} and a code string. Nothing it sends
 * about money is read, because nothing it can send expresses money.
 */

export type BasketIssue = {
  sku: string
  kind: 'UNKNOWN' | 'UNAVAILABLE' | 'INSUFFICIENT_STOCK'
  message: string
  availableQty?: number
}

export type PricedBasketResult = {
  basket: PricedBasket
  issues: BasketIssue[]
  codeError: string | null
}

export async function priceBasket(input: {
  lines: CartLine[]
  codeInput?: string | null
  now?: Date
}): Promise<PricedBasketResult> {
  const now = input.now ?? new Date()
  const settings = await getPricingSettings()

  const requestedSkus = [...new Set(input.lines.map((l) => l.sku))]
  const products = requestedSkus.length
    ? await prisma.product.findMany({ where: { sku: { in: requestedSkus } } })
    : []
  const bySku = new Map(products.map((p) => [p.sku, p]))

  const issues: BasketIssue[] = []
  const priceableLines: { product: PriceableProduct; qty: number }[] = []

  for (const line of input.lines) {
    const product = bySku.get(line.sku)

    if (!product) {
      issues.push({
        sku: line.sku,
        kind: 'UNKNOWN',
        message: 'That product is no longer listed and has been removed from your cart.',
      })
      continue
    }

    if (!product.isActive) {
      issues.push({
        sku: line.sku,
        kind: 'UNAVAILABLE',
        message: `${product.name} is no longer available and has been removed from your cart.`,
      })
      continue
    }

    if (product.stockQty <= 0) {
      issues.push({
        sku: line.sku,
        kind: 'INSUFFICIENT_STOCK',
        message: `${product.name} is out of stock and has been removed from your cart.`,
        availableQty: 0,
      })
      continue
    }

    // Reduce rather than reject: a customer who asked for 5 and can have 3
    // should see a corrected basket, not a failed checkout (§5.1).
    const qty = Math.min(line.qty, product.stockQty)
    if (qty < line.qty) {
      issues.push({
        sku: line.sku,
        kind: 'INSUFFICIENT_STOCK',
        message: `Only ${product.stockQty} of ${product.name} left — your quantity was reduced.`,
        availableQty: product.stockQty,
      })
    }

    priceableLines.push({
      product: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        slug: product.slug,
        priceCents: product.priceCents,
        imageUrl: product.imageUrl,
        stockQty: product.stockQty,
        isActive: product.isActive,
      },
      qty,
    })
  }

  // Price once WITHOUT the code to get the subtotal the code is judged against.
  const withoutCode = computeTotals({ lines: priceableLines, code: null, settings })

  let validation: DiscountValidation | null = null
  if (input.codeInput && input.codeInput.trim()) {
    const code = normaliseCode(input.codeInput)
    const row = await prisma.discountCode.findUnique({ where: { code } })
    validation = validateDiscountCode(row, { now, subtotalCents: withoutCode.subtotalCents })
  }

  const basket = computeTotals({
    lines: priceableLines,
    code: validation?.ok ? validation.code : null,
    settings,
  })

  return {
    basket,
    issues,
    codeError: validation && !validation.ok ? validation.message : null,
  }
}
