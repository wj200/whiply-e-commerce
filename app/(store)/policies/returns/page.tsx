import type { Metadata } from 'next'
import { Prose, AwaitingCopy } from '@/components/store/prose'
import { PageHeader } from '@/components/store/page-header'

export const metadata: Metadata = { title: 'Returns & Refunds' }

export default function ReturnsPolicyPage() {
  return (
    <>
      <PageHeader title="Returns &amp; Refunds" />
      <Prose>
        <AwaitingCopy what="returns terms" />
        <h2>Refunds</h2>
        <p>
          Refunds are issued to the original payment method through our payment provider. Where an
          order has not yet been dispatched, a refund can be issued in full.
        </p>
        <h2>Damaged or incorrect goods</h2>
        <p>
          Contact us with your order reference and we will resolve it. Do not use a cylinder that
          appears damaged.
        </p>
        <h2>Pressurised goods</h2>
        <p>
          Returns of pressurised N₂O cylinders may be subject to conditions that WHIPLY must
          confirm with its carrier before publishing final terms.
        </p>
      </Prose>
    </>
  )
}
