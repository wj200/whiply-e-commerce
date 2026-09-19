import type { Metadata } from 'next'
import { listActiveProducts } from '@/lib/domain/products'
import { ProductGrid, toCardData } from '@/components/store/product-grid'
import { CollectionHeader } from '@/components/store/collection-header'
import { DeliveryPanel } from '@/components/store/delivery-panel'
import { getPricingSettings } from '@/lib/domain/settings'

export const metadata: Metadata = {
  title: 'Shop all',
  description: 'Everything WHIPLY stocks — cream chargers and professional baking equipment.',
}

export default async function ShopPage() {
  const [products, settings] = await Promise.all([listActiveProducts(), getPricingSettings()])

  return (
    <>
      <CollectionHeader
        eyebrow="The considered collection"
        title="A little precision. A lot of possibility."
        blurb="Workhorses for your kitchen. Finishing touches for your craft."
        count={products.length}
        active="all"
        showUsageNote
      />
      <div className="wrap py-12 lg:py-16">
        <ProductGrid products={products.map(toCardData)} priorityCount={2} />
      </div>
      <DeliveryPanel {...settings} />
    </>
  )
}
