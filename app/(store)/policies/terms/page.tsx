import type { Metadata } from 'next'
import { Prose, AwaitingCopy } from '@/components/store/prose'
import { PageHeader } from '@/components/store/page-header'

export const metadata: Metadata = { title: 'Terms of Sale' }

export default function TermsPage() {
  return (
    <>
      <PageHeader title="Terms of Sale" />
      <Prose>
        <AwaitingCopy what="summary of how orders work" />
        <h2>Orders</h2>
        <p>
          An order is formed when payment is confirmed by our payment provider. Prices and delivery
          fees are those shown at checkout and are calculated by WHIPLY at the time the order is
          created.
        </p>
        <h2>Stock</h2>
        <p>
          Stock is deducted when payment is confirmed. If an item becomes unavailable after your
          payment, we will contact you to arrange a replacement or a refund.
        </p>
        <h2>Products</h2>
        <p>
          Product specifications are published as supplied to us. Products must be used only for
          their stated intended purpose and in accordance with the safety information supplied.
        </p>
      </Prose>
    </>
  )
}
