import type { Metadata } from 'next'
import { Prose, AwaitingCopy, PageHeader } from '@/components/store/prose'

import { getPricingSettings } from '@/lib/domain/settings'
import { formatSgd, cents } from '@/lib/money'

export const metadata: Metadata = { title: 'Delivery Policy' }

export default async function DeliveryPolicyPage() {
  const { deliveryFeeCents, freeDeliveryThresholdCents } = await getPricingSettings()
  return (
    <>
      <PageHeader title="Delivery Policy" />
      <Prose>
        <AwaitingCopy what="delivery terms" />
        <h2>Where we deliver</h2>
        <p>Singapore only. All orders are delivered — there is no self-collection option.</p>
        <h2>What delivery costs</h2>
        <ul>
          <li>
            Orders of <strong>{formatSgd(cents(freeDeliveryThresholdCents))}</strong> or more
            (after any discount): <strong>free delivery</strong>.
          </li>
          <li>
            Orders below {formatSgd(cents(freeDeliveryThresholdCents))}: a flat{' '}
            <strong>{formatSgd(cents(deliveryFeeCents))}</strong> delivery fee.
          </li>
        </ul>
        <p>
          The threshold is assessed on the order value after any discount code has been applied.
          A {formatSgd(cents(freeDeliveryThresholdCents))} order reduced below the threshold by a
          discount pays the delivery fee.
        </p>
        <h2>When we deliver</h2>
        <p>
          Orders are dispatched once payment is confirmed. Delivery timing depends on courier
          availability and on the goods in the order. We will contact you if an order cannot be
          delivered as expected.
        </p>
      </Prose>
    </>
  )
}
