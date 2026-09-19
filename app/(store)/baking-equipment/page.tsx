import type { Metadata } from 'next'
import { listByCategory, CATEGORY_META } from '@/lib/domain/products'
import { ProductGrid } from '@/components/store/product-grid'
import { PageHeader } from '@/components/store/page-header'
import { DeliveryNote } from '@/components/store/delivery-note'
import { getPricingSettings } from '@/lib/domain/settings'

export const metadata: Metadata = {
  title: 'Baking Equipment',
  description:
    'Precision equipment built for the demands of a working bakery.',
}

export default async function BakingEquipmentPage() {
  const [products, settings] = await Promise.all([
    listByCategory('BAKING_EQUIPMENT'),
    getPricingSettings(),
  ])
  const meta = CATEGORY_META.BAKING_EQUIPMENT

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
