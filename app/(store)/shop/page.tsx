import type { Metadata } from 'next'
import { listActiveProducts, CATEGORY_META } from '@/lib/domain/products'
import { ProductGrid } from '@/components/store/product-grid'
import { PageHeader } from '@/components/store/page-header'
import { DeliveryNote } from '@/components/store/delivery-note'
import { getPricingSettings } from '@/lib/domain/settings'
import type { ProductCategory } from '@/lib/generated/prisma'

export const metadata: Metadata = {
  title: 'Shop',
  description: 'Everything WHIPLY stocks — cream chargers and professional baking equipment.',
}

const ORDER: ProductCategory[] = ['CREAM_CHARGERS', 'BAKING_EQUIPMENT']

export default async function ShopPage() {
  const [products, settings] = await Promise.all([listActiveProducts(), getPricingSettings()])

  return (
    <>
      <PageHeader
        title="Shop"
        blurb="Everything we stock, in one place. Delivered across Singapore."
      />
      <div className="wrap space-y-14 py-10">
        {ORDER.map((category) => {
          const inCategory = products.filter((p) => p.category === category)
          if (inCategory.length === 0) return null
          return (
            <section key={category}>
              <h2 className="mb-5 font-display text-2xl font-bold text-ink">
                {CATEGORY_META[category].title}
              </h2>
              <ProductGrid
                products={inCategory.map((p) => ({
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
          )
        })}
        <div className="max-w-2xl">
          <DeliveryNote {...settings} />
        </div>
      </div>
    </>
  )
}
