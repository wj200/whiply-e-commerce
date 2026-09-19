import Image from 'next/image'
import Link from 'next/link'
import { listActiveProducts } from '@/lib/domain/products'
import { getPricingSettings } from '@/lib/domain/settings'
import { ProductGrid } from '@/components/store/product-grid'
import { DeliveryBanner } from '@/components/store/delivery-note'
import { ButtonLink } from '@/components/ui/button'

export default async function HomePage() {
  const [products, settings] = await Promise.all([listActiveProducts(), getPricingSettings()])

  return (
    <>
      {/* Hero — §3.3 */}
      <section className="border-b border-line bg-shell">
        <div className="wrap grid items-center gap-10 py-14 md:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-accent">
              Professional Baking Supply · Singapore
            </p>
            <h1 className="mt-4 font-display text-[2.6rem] font-bold leading-[1.05] tracking-tight text-ink md:text-6xl">
              Professional Baking.
              <br />
              Simplified.
            </h1>
            <p className="mt-5 max-w-lg text-[1.08rem] leading-relaxed text-muted">
              Food-grade N₂O cream chargers and professional baking equipment for working
              kitchens — stocked, priced clearly, and delivered across Singapore.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/cream-chargers" size="lg">
                Shop Cream Chargers
              </ButtonLink>
              <ButtonLink href="/baking-equipment" size="lg" variant="secondary">
                Shop Baking Equipment
              </ButtonLink>
            </div>
          </div>

          <div className="relative aspect-16/11 overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper shadow-[var(--shadow-card)]">
            <Image
              src="/images/hero.svg"
              alt="A professional baking work surface with a whipped-cream preparation and a food-grade N₂O charger"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
              priority
            />
          </div>
        </div>
      </section>

      {/* Featured products — §3.3 */}
      <section className="wrap py-14 md:py-16">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
              What we stock
            </h2>
            <p className="mt-1.5 text-muted">Four products. No guesswork.</p>
          </div>
          <Link
            href="/shop"
            className="shrink-0 text-sm font-semibold text-accent hover:text-accent-hover"
          >
            View all →
          </Link>
        </div>
        <ProductGrid
          priorityCount={0}
          products={products.map((p) => ({
            sku: p.sku,
            slug: p.slug,
            name: p.name,
            shortDesc: p.shortDesc,
            priceCents: p.priceCents,
            imageUrl: p.imageUrl,
            imageAlt: p.imageAlt,
            inStock: p.inStock,
            category: p.category,
          }))}
        />
      </section>

      <DeliveryBanner {...settings} />

      {/* Positioning — §3.3, no invented statistics or testimonials */}
      <section className="wrap grid gap-8 py-14 md:grid-cols-3 md:py-16">
        {[
          {
            title: 'Food-grade supply',
            body: 'N₂O chargers specified for culinary use, with the handling and storage information on the product page where you can actually read it.',
          },
          {
            title: 'Equipment that works',
            body: 'Precision scales and professional mixers chosen for continuous kitchen use, not for a domestic worktop.',
          },
          {
            title: 'Island-wide delivery',
            body: 'One flat delivery fee, free above the threshold, and no self-collection to arrange around a service.',
          },
        ].map((item) => (
          <div key={item.title}>
            <h3 className="text-[1.05rem] font-semibold text-ink">{item.title}</h3>
            <p className="mt-2 leading-relaxed text-muted">{item.body}</p>
          </div>
        ))}
      </section>

      {/* Bulk orders — §3.3 */}
      <section className="border-t border-line bg-shell">
        <div className="wrap flex flex-col items-start justify-between gap-5 py-12 md:flex-row md:items-center">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-ink">
              Ordering for a kitchen?
            </h2>
            <p className="mt-1.5 max-w-xl text-muted">
              Tell us what you need and we will come back to you with trade pricing. No account,
              no minimum, no automated quote.
            </p>
          </div>
          <ButtonLink href="/bulk-orders" size="lg" className="shrink-0">
            Enquire about bulk orders
          </ButtonLink>
        </div>
      </section>
    </>
  )
}
