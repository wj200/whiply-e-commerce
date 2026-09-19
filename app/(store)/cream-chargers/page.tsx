import type { Metadata } from 'next'
import { listByCategory } from '@/lib/domain/products'
import { ProductGrid, toCardData } from '@/components/store/product-grid'
import { CollectionHeader } from '@/components/store/collection-header'
import { DeliveryPanel } from '@/components/store/delivery-panel'
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

  return (
    <>
      <CollectionHeader
        eyebrow="Cream chargers"
        title="Extraordinary, by the gram."
        blurb="Food-grade N₂O for the perfect peak, in two sizes."
        count={products.length}
        active="chargers"
        showUsageNote
      />
      <div className="wrap py-12 lg:py-16">
        <ProductGrid products={products.map(toCardData)} priorityCount={2} />
      </div>
      <DeliveryPanel {...settings} />
    </>
  )
}
