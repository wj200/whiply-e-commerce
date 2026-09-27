import type { Metadata } from 'next'
import { listByCategory } from '@/lib/domain/products'
import { ProductGrid, toCardData } from '@/components/store/product-grid'
import { CollectionHeader } from '@/components/store/collection-header'
import { DeliveryPanel } from '@/components/store/delivery-panel'
import { getPricingSettings } from '@/lib/domain/settings'

export const metadata: Metadata = {
  title: 'Cream',
  description:
    'Whipping creams and all-purpose creams, ready for the dispenser or the mixing bowl.',
}

export default async function CreamProductsPage() {
  const [products, settings] = await Promise.all([
    listByCategory('CREAM_PRODUCTS'),
    getPricingSettings(),
  ])

  return (
    <>
      <CollectionHeader
        eyebrow="Cream"
        title="The other half of the peak."
        blurb="Powdered, spray and fresh — matched to the charger, not an afterthought."
        count={products.length}
        active="cream"
      />
      <div className="wrap py-12 lg:py-16">
        <ProductGrid products={products.map(toCardData)} priorityCount={2} />
      </div>
      <DeliveryPanel {...settings} />
    </>
  )
}
