import { listActiveProducts } from '@/lib/domain/products'
import { getPricingSettings } from '@/lib/domain/settings'
import { ProductGrid, toCardData } from '@/components/store/product-grid'
import { Hero } from '@/components/store/hero'
import { FeatureStrip } from '@/components/store/feature-strip'
import { DeliveryPanel } from '@/components/store/delivery-panel'
import { CategoryChips } from '@/components/store/category-chips'
import { UsageNote } from '@/components/store/usage-note'
import { ButtonLink } from '@/components/ui/button'

export default async function HomePage() {
  const [products, settings] = await Promise.all([listActiveProducts(), getPricingSettings()])

  return (
    <>
      <Hero />
      <FeatureStrip />

      <section className="wrap py-16 lg:py-24">
        <p className="mono text-ink">The considered collection</p>

        <div className="mt-6 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <h2 className="display-sm max-w-3xl text-[clamp(1.9rem,4.2vw,3.1rem)]">
            A little precision. A lot of possibility.
          </h2>
          <p className="shrink-0 text-[0.9375rem] leading-relaxed text-muted lg:text-right">
            Workhorses for your kitchen.
            <br />
            Finishing touches for your craft.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-5">
          <CategoryChips active="all" />
          <p className="mono text-faint">
            {String(products.length).padStart(2, '0')} Essentials
          </p>
        </div>

        <div className="mt-8">
          <UsageNote />
        </div>

        <div className="mt-12">
          <ProductGrid products={products.map(toCardData)} priorityCount={2} />
        </div>
      </section>

      <DeliveryPanel {...settings} />

      <section className="wrap pb-20 lg:pb-28">
        <div className="flex flex-col justify-between gap-8 border-t border-line pt-14 lg:flex-row lg:items-end">
          <div>
            <p className="mono text-faint">02 / For the bigger batch</p>
            <h2 className="display-sm mt-5 max-w-xl text-[clamp(1.75rem,3.2vw,2.5rem)]">
              Ordering for a kitchen?
            </h2>
            <p className="mt-5 max-w-lg text-[1rem] leading-relaxed text-body">
              Tell us what you need and we will come back to you directly with trade pricing. No
              account, no minimum, no automated quote.
            </p>
          </div>
          <ButtonLink href="/bulk-orders" size="lg" arrow className="shrink-0 sm:min-w-[17rem]">
            Enquire about bulk orders
          </ButtonLink>
        </div>
      </section>
    </>
  )
}
