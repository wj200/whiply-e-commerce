import type { Metadata } from 'next'
import { listByCategory, CATEGORY_META } from '@/lib/domain/products'
import { ProductGrid } from '@/components/store/product-grid'
import { PageHeader } from '@/components/store/page-header'
import { DeliveryNote } from '@/components/store/delivery-note'
import { getPricingSettings } from '@/lib/domain/settings'

export const metadata: Metadata = {
  title: 'Cream Chargers',
  description:
    'Food-grade N₂O cream chargers for professional cream whipping and culinary preparation.',
}

export default async function CreamChargersPage() {
  const [products, settings] = await Promise.all([
    listByCategory('CREAM_CHARGERS'),
    getPricingSettings(),
  ])
  const meta = CATEGORY_META.CREAM_CHARGERS

  return (
    <>
      <PageHeader title={meta.title} blurb={meta.blurb} />
      <div className="wrap py-10">
        <ProductGrid
          priorityCount={2}
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
        <div className="mt-8 max-w-2xl">
          <DeliveryNote {...settings} />
        </div>
      </div>
    </>
  )
}
