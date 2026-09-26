import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/db/client'
import { cents, type Cents } from '@/lib/money'
import type { ProductCategory } from '@/lib/generated/prisma'

/**
 * Blueprint §A1 — the product read layer.
 *
 * Every storefront query goes through here, and every storefront query filters
 * on `isActive`. A disabled product is absent from the storefront entirely —
 * not merely hidden by CSS — and is refused again at checkout (§6.2).
 */

export type ProductSpec = { label: string; value: string }

export type StoreProduct = {
  id: string
  sku: string
  slug: string
  name: string
  category: ProductCategory
  cardLabel: string | null
  shortDesc: string
  description: string
  specs: ProductSpec[]
  priceCents: Cents
  imageUrl: string | null
  imageAlt: string
  stockQty: number
  inStock: boolean
  isActive: boolean
}

function toStoreProduct(row: {
  id: string
  sku: string
  slug: string
  name: string
  category: ProductCategory
  cardLabel: string | null
  shortDesc: string
  description: string
  specs: unknown
  priceCents: number
  imageUrl: string | null
  imageAlt: string | null
  stockQty: number
  isActive: boolean
}): StoreProduct {
  return {
    id: row.id,
    sku: row.sku,
    slug: row.slug,
    name: row.name,
    category: row.category,
    cardLabel: row.cardLabel,
    shortDesc: row.shortDesc,
    description: row.description,
    specs: parseSpecs(row.specs),
    priceCents: cents(row.priceCents),
    imageUrl: row.imageUrl,
    imageAlt: row.imageAlt ?? row.name,
    stockQty: row.stockQty,
    inStock: row.stockQty > 0,
    isActive: row.isActive,
  }
}

function parseSpecs(raw: unknown): ProductSpec[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const { label, value } = entry as Record<string, unknown>
    if (typeof label !== 'string' || typeof value !== 'string') return []
    return [{ label, value }]
  })
}

const ACTIVE = { isActive: true } as const
const ORDER = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }]

export const listActiveProducts = cache(async (): Promise<StoreProduct[]> => {
  const rows = await prisma.product.findMany({ where: ACTIVE, orderBy: ORDER })
  return rows.map(toStoreProduct)
})

export const listByCategory = cache(
  async (category: ProductCategory): Promise<StoreProduct[]> => {
    const rows = await prisma.product.findMany({
      where: { ...ACTIVE, category },
      orderBy: ORDER,
    })
    return rows.map(toStoreProduct)
  },
)

export const getProductBySlug = cache(async (slug: string): Promise<StoreProduct | null> => {
  const row = await prisma.product.findFirst({ where: { ...ACTIVE, slug } })
  return row ? toStoreProduct(row) : null
})

export const listAllSlugs = cache(async (): Promise<string[]> => {
  const rows = await prisma.product.findMany({ where: ACTIVE, select: { slug: true } })
  return rows.map((r) => r.slug)
})

export const CATEGORY_META: Record<
  ProductCategory,
  { slug: string; title: string; blurb: string }
> = {
  CREAM_CHARGERS: {
    slug: '/cream-chargers',
    title: 'Cream Chargers',
    blurb:
      'Food-grade N₂O cream chargers for professional cream whipping and culinary preparation.',
  },
  CREAM_PRODUCTS: {
    slug: '/cream-products',
    title: 'Cream Products',
    blurb:
      'Whipping creams and all-purpose creams, ready for the dispenser or the mixing bowl.',
  },
  BAKING_EQUIPMENT: {
    slug: '/baking-equipment',
    title: 'Baking Equipment',
    blurb: 'Precision equipment built for the demands of a working bakery.',
  },
}
