import { ProductCard, type ProductCardData } from './product-card'

export function ProductGrid({
  products,
  priorityCount = 0,
}: {
  products: ProductCardData[]
  priorityCount?: number
}) {
  if (products.length === 0) {
    return (
      <p className="mono border border-line py-16 text-center text-faint">
        Nothing available here right now.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
      {products.map((p, i) => (
        <ProductCard key={p.sku} product={p} priority={i < priorityCount} />
      ))}
    </div>
  )
}

/** Map a StoreProduct to the card's data shape. */
export function toCardData(p: {
  sku: string
  slug: string
  name: string
  cardLabel: string | null
  shortDesc: string
  priceCents: number
  imageUrl: string | null
  imageAlt: string
  inStock: boolean
  category: ProductCardData['category']
}): ProductCardData {
  return {
    sku: p.sku,
    slug: p.slug,
    name: p.name,
    cardLabel: p.cardLabel,
    shortDesc: p.shortDesc,
    priceCents: p.priceCents,
    imageUrl: p.imageUrl,
    imageAlt: p.imageAlt,
    inStock: p.inStock,
    category: p.category,
  }
}
