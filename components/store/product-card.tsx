'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { formatSgd, cents } from '@/lib/money'
import { productImageSrc } from '@/lib/media/product-image'
import { QuantityStepper } from './quantity-stepper'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useCart } from '@/lib/cart/context'
import { useRouter } from 'next/navigation'
import { CATEGORY_LABEL } from '@/lib/domain/category'
import type { ProductCategory } from '@/lib/generated/prisma'

export type ProductCardData = {
  sku: string
  slug: string
  name: string
  shortDesc: string
  priceCents: number
  imageUrl: string | null
  imageAlt: string
  inStock: boolean
  category: ProductCategory
}

/**
 * ONE card component, used on the homepage, both category pages and the shop
 * grid (§3.4) — which is what makes four products from four sources read as
 * one catalogue.
 */
export function ProductCard({ product, priority = false }: { product: ProductCardData; priority?: boolean }) {
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const { add, buyNow } = useCart()
  const router = useRouter()

  function handleAdd() {
    if (!product.inStock) return
    add(product.sku, qty)
    setAdded(true)
    window.setTimeout(() => setAdded(false), 1600)
  }

  function handleBuyNow() {
    if (!product.inStock) return
    buyNow(product.sku, qty)
    router.push('/checkout')
  }

  return (
    <article className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper shadow-[var(--shadow-card)] transition-shadow duration-150 hover:shadow-[var(--shadow-lift)]">
      <Link
        href={`/product/${product.slug}`}
        className="relative block aspect-4/5 overflow-hidden bg-shell"
        tabIndex={-1}
        aria-hidden="true"
      >
        <Image
          src={productImageSrc(product)}
          alt=""
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className="object-cover"
          priority={priority}
        />
        {!product.inStock ? (
          <span className="absolute left-3 top-3">
            <Badge tone="danger">Out of stock</Badge>
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-[0.7rem] font-bold uppercase tracking-widest text-faint">
            {CATEGORY_LABEL[product.category]}
          </p>
          <h3 className="mt-1 text-[0.95rem] font-semibold leading-snug text-ink">
            <Link href={`/product/${product.slug}`} className="hover:text-accent">
              {product.name}
            </Link>
          </h3>
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">
            {product.shortDesc}
          </p>
        </div>

        <p className="text-xl font-bold text-ink tnum">{formatSgd(cents(product.priceCents))}</p>

        <div className="mt-auto flex flex-col gap-2">
          <QuantityStepper
            value={qty}
            onChange={setQty}
            disabled={!product.inStock}
            label={`Quantity for ${product.name}`}
          />
          <Button onClick={handleAdd} disabled={!product.inStock} aria-live="polite">
            {added ? 'Added ✓' : 'Add to Cart'}
          </Button>
          <Button variant="secondary" onClick={handleBuyNow} disabled={!product.inStock}>
            Buy Now
          </Button>
        </div>
      </div>
    </article>
  )
}
