import type { Metadata } from 'next'
import { listByCategory } from '@/lib/domain/products'
import { ProductGrid, toCardData } from '@/components/store/product-grid'
import { CollectionHeader } from '@/components/store/collection-header'
import { DeliveryPanel } from '@/components/store/delivery-panel'
import { getPricingSettings } from '@/lib/domain/settings'

export const metadata: Metadata = {
  title: 'Equipment',
  description: 'Precision equipment built for the demands of a working bakery.',
}

export default async function BakingEquipmentPage() {
  const [products, settings] = await Promise.all([
    listByCategory('BAKING_EQUIPMENT'),
    getPricingSettings(),
  ])

  return (
    <>
      <CollectionHeader
        eyebrow="Equipment"
        title="Workhorses for your kitchen."
        blurb="Chosen for continuous professional use, not a domestic worktop."
        count={products.length}
        active="equipment"
      />
      <div className="wrap py-12 lg:py-16">
        <ProductGrid products={products.map(toCardData)} priorityCount={2} />
      </div>
      <DeliveryPanel {...settings} />
    </>
  )
}
