import type { Metadata } from 'next'
import { Prose, PageHeader } from '@/components/store/prose'

export const metadata: Metadata = {
  title: 'About',
  description: 'WHIPLY is a Singapore supplier of professional baking and culinary products.',
}

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="Precision meets possibility"
        title="A supplier, not a marketplace."
        blurb="For kitchens with possibilities."
      />
      <Prose>
        <p>
          WHIPLY supplies working kitchens in Singapore with food-grade N₂O cream chargers and
          professional baking equipment. We keep a deliberately short catalogue: the products we
          can stock reliably, priced clearly, delivered island-wide.
        </p>

        <h2>What we stock</h2>
        <p>
          Two sizes of food-grade N₂O cream charger for culinary cream whipping, and equipment
          chosen for continuous professional use — a precision digital weighing scale and an
          industrial-grade stand mixer. Four products. No guesswork.
        </p>

        <h2>How we sell</h2>
        <p>
          No account required. Add what you need, pay, and we deliver. For trade quantities, use the
          bulk order enquiry and we will come back to you directly rather than send an automated
          quote.
        </p>

        <h2>Product information</h2>
        <p>
          Product pages state capacity, weight, food-grade designation and intended culinary use,
          along with the applicable handling and storage information. We publish what the supplier
          documentation supports and nothing beyond it.
        </p>
      </Prose>
    </>
  )
}
