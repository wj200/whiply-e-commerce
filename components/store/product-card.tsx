'use client'

import Image from 'next/image'
import Link from 'next/link'
import { formatSgd, cents } from '@/lib/money'
import { productImageSrc } from '@/lib/media/product-image'
import { ArrowDisc } from '@/components/ui/arrow'
import { useCart } from '@/lib/cart/context'
import { useBag } from './bag-context'
import type { ProductCategory } from '@/lib/generated/prisma'

export type ProductCardData = {
  sku: string
  slug: string
  name: string
  cardLabel: string | null
  shortDesc: string
  priceCents: number
  imageUrl: string | null
  imageAlt: string
  inStock: boolean
  category: ProductCategory
}

/**
 * One card, used by the homepage, both category grids and /shop — which is
 * what makes four products from four sources read as one catalogue.
 *
 * Image with a mono label and a circular arrow, then name, subtitle, price.
 * Add to bag appears on hover/focus so the grid stays quiet at rest.
 */
export function ProductCard({
  product,
  priority = false,
}: {
  product: ProductCardData
  priority?: boolean
}) {
  const { add } = useCart()
  const { openBag } = useBag()

  function addToBag(e: React.MouseEvent) {
    e.preventDefault()
    if (!product.inStock) return
    add(product.sku, 1)
    openBag()
  }

  return (
    <article className="group flex flex-col">
      <Link href={`/product/${product.slug}`} className="block">
        <div className="relative aspect-4/5 overflow-hidden bg-frame">
          <Image
            src={productImageSrc(product)}
            alt={product.imageAlt}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            priority={priority}
          />

          {product.cardLabel ? (
            <p className="mono absolute left-5 top-5 text-ink/70">{product.cardLabel}</p>
          ) : null}

          {!product.inStock ? (
            <p className="mono-sm absolute left-5 top-12 border border-ink/30 bg-paper/85 px-2 py-1 text-ink">
              Out of stock
            </p>
          ) : null}

          <span className="absolute bottom-5 right-5">
            <ArrowDisc />
          </span>
        </div>

        <div className="pt-5">
          <h3 className="text-[1.0625rem] font-medium leading-snug tracking-[-0.015em] text-ink">
            {product.name}
          </h3>
          <p className="mt-1.5 text-[0.9375rem] text-muted">{product.shortDesc}</p>
          <p className="figure mt-3.5 text-[1.0625rem] text-ink">
            {formatSgd(cents(product.priceCents), { alwaysCents: true })}
          </p>
        </div>
      </Link>

      <button
        type="button"
        onClick={addToBag}
        disabled={!product.inStock}
        className="mt-4 h-11 w-full border border-line-strong text-[0.875rem] font-medium text-ink opacity-0 transition-all duration-200 hover:border-ink focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-0 max-lg:opacity-100 max-lg:disabled:opacity-40"
      >
        {product.inStock ? 'Add to bag' : 'Out of stock'}
      </button>
    </article>
  )
}
