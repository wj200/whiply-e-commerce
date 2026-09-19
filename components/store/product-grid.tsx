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
      <p className="rounded-[var(--radius-card)] border border-dashed border-line bg-shell px-6 py-12 text-center text-muted">
        Nothing available in this category right now.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {products.map((p, i) => (
        <ProductCard key={p.sku} product={p} priority={i < priorityCount} />
      ))}
    </div>
  )
}
