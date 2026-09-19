import type { Metadata } from 'next'
import { Prose, AwaitingCopy, PageHeader } from '@/components/store/prose'

export const metadata: Metadata = {
  title: 'Culinary Usage Agreement',
  description: 'WHIPLY cream chargers are supplied for culinary use only.',
}

/**
 * GUARD-6 made explicit. Linked from every surface that sells a charger.
 */
export default function UsagePage() {
  return (
    <>
      <PageHeader
        eyebrow="The details"
        title="Culinary usage agreement."
        blurb="A little responsibility goes a long way."
      />
      <Prose>
        <AwaitingCopy what="summary of the conditions of sale" />

        <h2>What these products are for</h2>
        <p>
          WHIPLY cream chargers contain food-grade nitrous oxide (N₂O) and are supplied{' '}
          <strong>for culinary use only</strong> — the whipping and aeration of cream and related
          preparations, using equipment rated for the cylinder.
        </p>

        <h2>Conditions of sale</h2>
        <ul>
          <li>Products are sold for use in food preparation, and for no other purpose.</li>
          <li>
            By placing an order you confirm you are purchasing for culinary use and will use the
            product accordingly.
          </li>
          <li>
            WHIPLY may decline or cancel an order at its discretion, refunding any payment taken.
          </li>
        </ul>

        <h2>Handling and storage</h2>
        <ul>
          <li>These are pressurised containers. Keep away from heat and direct sunlight.</li>
          <li>Use only with equipment rated for the cylinder size you have bought.</li>
          <li>Follow the handling and storage instructions supplied with the product.</li>
          <li>Do not use a cylinder that appears damaged.</li>
        </ul>

        <h2>Delivery of pressurised goods</h2>
        <p>
          Because these are pressurised goods, delivery is subject to the carrier&apos;s acceptance,
          packaging requirements and vehicle suitability. We will contact you if an order cannot be
          delivered as expected.
        </p>

        <h2>Applicable law</h2>
        <p>
          Any legal or regulatory requirements that apply to the sale, purchase, storage or
          transport of these products in Singapore apply in full. Final wording for this section is
          to be supplied by WHIPLY on the advice of a qualified adviser (§16.1).
        </p>
      </Prose>
    </>
  )
}
