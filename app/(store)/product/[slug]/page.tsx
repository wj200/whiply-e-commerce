import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProductBySlug, listAllSlugs, CATEGORY_META } from '@/lib/domain/products'
import { getPricingSettings } from '@/lib/domain/settings'
import { productImageSrc } from '@/lib/media/product-image'
import { formatSgd } from '@/lib/money'
import { ProductActions } from '@/components/store/product-actions'
import { UsageNote } from '@/components/store/usage-note'
import { DeliveryPanel } from '@/components/store/delivery-panel'

export async function generateStaticParams() {
  return (await listAllSlugs()).map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const product = await getProductBySlug(slug)
  if (!product) return { title: 'Product not found' }
  return {
    title: product.name,
    description: product.shortDesc,
    openGraph: { title: product.name, description: product.shortDesc },
  }
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [product, settings] = await Promise.all([getProductBySlug(slug), getPricingSettings()])
  if (!product) notFound()

  const category = CATEGORY_META[product.category]
  const isCharger = product.category === 'CREAM_CHARGERS'

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    sku: product.sku,
    category: category.title,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'SGD',
      price: (product.priceCents / 100).toFixed(2),
      availability: product.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="wrap pt-8">
        <nav aria-label="Breadcrumb" className="mono text-faint">
          <Link href="/shop" className="transition-colors hover:text-ink">
            Shop
          </Link>
          <span className="px-2">/</span>
          <Link href={category.slug} className="transition-colors hover:text-ink">
            {category.title}
          </Link>
        </nav>
      </div>

      <div className="wrap grid gap-12 py-10 lg:grid-cols-2 lg:gap-16 lg:py-14">
        <div className="relative aspect-4/5 overflow-hidden bg-frame">
          <Image
            src={productImageSrc(product)}
            alt={product.imageAlt}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
            priority
          />
          {product.cardLabel ? (
            <p className="mono absolute left-6 top-6 text-ink/70">{product.cardLabel}</p>
          ) : null}
        </div>

        <div className="flex flex-col lg:py-4">
          <p className="mono text-faint">{category.title}</p>

          <h1 className="display-sm mt-5 text-[clamp(1.9rem,3.6vw,2.75rem)]">{product.name}</h1>

          <p className="mt-4 text-[1rem] text-muted">{product.shortDesc}</p>

          <p className="figure mt-7 text-[1.75rem] text-ink">
            {formatSgd(product.priceCents, { alwaysCents: true })}
          </p>

          <p className="mono mt-3 text-faint">
            {product.inStock ? 'In stock · ships from Singapore' : 'Out of stock'}
          </p>

          <div className="mt-9">
            <ProductActions sku={product.sku} name={product.name} inStock={product.inStock} />
          </div>

          <p className="mt-8 text-[1rem] leading-relaxed text-body">{product.description}</p>

          {isCharger ? (
            <div className="mt-8 border-t border-line pt-7">
              <UsageNote />
            </div>
          ) : null}

          {product.specs.length > 0 ? (
            <div className="mt-10 border-t border-line">
              <p className="mono py-6 text-faint">Specifications</p>
              <dl className="divide-y divide-line border-t border-line">
                {product.specs.map((spec) => (
                  <div key={spec.label} className="grid gap-2 py-5 sm:grid-cols-[11rem_1fr]">
                    <dt className="mono text-faint">{spec.label}</dt>
                    <dd className="text-[0.9375rem] leading-relaxed text-body">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </div>
      </div>

      <DeliveryPanel {...settings} />
    </>
  )
}
