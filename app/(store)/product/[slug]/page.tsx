import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProductBySlug, listAllSlugs, CATEGORY_META } from '@/lib/domain/products'
import { getPricingSettings } from '@/lib/domain/settings'
import { productImageSrc } from '@/lib/media/product-image'
import { formatSgd } from '@/lib/money'
import { Badge } from '@/components/ui/badge'
import { ProductActions } from '@/components/store/product-actions'
import { DeliveryNote } from '@/components/store/delivery-note'

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

  // Structured data reads the SAME row the page renders — never a second
  // hard-coded copy that can drift from what checkout will charge (§3.8).
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

      <div className="wrap py-6">
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link href="/" className="hover:text-accent">
            Home
          </Link>
          <span className="px-2 text-faint">/</span>
          <Link href={category.slug} className="hover:text-accent">
            {category.title}
          </Link>
          <span className="px-2 text-faint">/</span>
          <span className="text-body">{product.name}</span>
        </nav>
      </div>

      <div className="wrap grid gap-10 pb-16 lg:grid-cols-2 lg:gap-14">
        <div className="relative aspect-4/5 overflow-hidden rounded-[var(--radius-card)] border border-line bg-shell">
          <Image
            src={productImageSrc(product)}
            alt={product.imageAlt}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
            priority
          />
        </div>

        <div className="flex flex-col gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-faint">
              {category.title}
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold leading-tight tracking-tight text-ink md:text-4xl">
              {product.name}
            </h1>
            <div className="mt-4 flex items-center gap-3">
              <p className="text-3xl font-bold text-ink tnum">
                {formatSgd(product.priceCents)}
              </p>
              {product.inStock ? (
                <Badge tone="success">In stock</Badge>
              ) : (
                <Badge tone="danger">Out of stock</Badge>
              )}
            </div>
          </div>

          <p className="text-[1.02rem] leading-relaxed text-body">{product.description}</p>

          <ProductActions sku={product.sku} name={product.name} inStock={product.inStock} />

          {product.specs.length > 0 ? (
            <div className="rounded-[var(--radius-card)] border border-line bg-shell">
              <h2 className="border-b border-line px-5 py-3 text-xs font-bold uppercase tracking-widest text-muted">
                Specifications
              </h2>
              <dl className="divide-y divide-line-soft">
                {product.specs.map((spec) => (
                  <div key={spec.label} className="grid gap-1 px-5 py-3 sm:grid-cols-[10rem_1fr]">
                    <dt className="text-sm font-semibold text-ink">{spec.label}</dt>
                    <dd className="text-sm leading-relaxed text-body">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          <div className="rounded-[var(--radius-card)] border border-line px-5 py-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Delivery</h2>
            <div className="mt-2">
              <DeliveryNote {...settings} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
