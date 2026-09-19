import type { Metadata } from 'next'
import Link from 'next/link'
import { findOrderByReference } from '@/lib/domain/orders'
import { isValidReference } from '@/lib/domain/reference'
import { formatSgd, cents } from '@/lib/money'
import { ButtonLink } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PaymentPoller } from '@/components/store/payment-poller'

export const metadata: Metadata = {
  title: 'Order confirmed',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * Blueprint §6.6 — THE REDIRECT IS A HINT.
 *
 * This page READS the order and shows whatever is true at that moment. It
 * writes nothing. A customer who closed the tab immediately after paying
 * still gets a fully processed order, because the tab was never load-bearing;
 * and someone who crafts this URL for an unpaid reference sees an unpaid
 * order, because the reference is a lookup key, not an assertion.
 */
export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>
}) {
  const { ref } = await searchParams

  if (!ref || !isValidReference(ref)) {
    return (
      <div className="wrap py-20 text-center">
        <h1 className="font-display text-3xl font-bold text-ink">Order not found</h1>
        <p className="mt-3 text-muted">
          Check the link, or contact us with your order reference.
        </p>
        <ButtonLink href="/" className="mt-7">
          Back to the shop
        </ButtonLink>
      </div>
    )
  }

  const order = await findOrderByReference(ref)

  if (!order) {
    return (
      <div className="wrap py-20 text-center">
        <h1 className="font-display text-3xl font-bold text-ink">Order not found</h1>
        <p className="mt-3 text-muted">
          We have no order with reference <span className="font-mono">{ref}</span>.
        </p>
        <ButtonLink href="/" className="mt-7">
          Back to the shop
        </ButtonLink>
      </div>
    )
  }

  const paid = order.payment?.paymentStatus === 'PAID'
  const failed = order.payment?.paymentStatus === 'FAILED' || order.orderStatus === 'CANCELLED'

  return (
    <div className="wrap max-w-2xl py-14">
      <div className="rounded-[var(--radius-card)] border border-line bg-paper p-7 shadow-[var(--shadow-card)]">
        {paid ? (
          <>
            <Badge tone="success">Payment received</Badge>
            <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-ink">
              Thank you — your order is confirmed.
            </h1>
          </>
        ) : failed ? (
          <>
            <Badge tone="danger">Payment not completed</Badge>
            <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-ink">
              This order was not paid.
            </h1>
          </>
        ) : (
          <>
            <Badge tone="warn">Confirming</Badge>
            <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-ink">
              We&apos;re confirming your payment…
            </h1>
            <PaymentPoller reference={order.reference} />
          </>
        )}

        <dl className="mt-6 space-y-1 border-y border-line py-5">
          <div className="flex justify-between gap-4">
            <dt className="text-sm text-muted">Order reference</dt>
            <dd className="font-mono text-sm font-bold text-ink">{order.reference}</dd>
          </div>
        </dl>

        <p className="mt-4 rounded-[var(--radius-control)] bg-accent-soft px-4 py-3 text-sm leading-relaxed text-accent">
          <strong className="font-semibold">Save this reference.</strong> WHIPLY does not use
          customer accounts, so this is how we find your order if you contact us.
        </p>

        <section className="mt-7">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted">What you ordered</h2>
          <ul className="mt-3 divide-y divide-line-soft">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-4 py-2.5 text-sm">
                <span className="text-body">
                  <span className="font-semibold text-ink">{item.quantity}×</span>{' '}
                  {item.nameAtPurchase}
                </span>
                <span className="shrink-0 font-semibold text-ink tnum">
                  {formatSgd(cents(item.lineTotalCents), { alwaysCents: true })}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <Row label="Subtotal" value={formatSgd(cents(order.subtotalCents), { alwaysCents: true })} />
            {order.discountCents > 0 ? (
              <Row
                label="Discount"
                value={`−${formatSgd(cents(order.discountCents), { alwaysCents: true })}`}
              />
            ) : null}
            <Row
              label="Delivery"
              value={
                order.deliveryFeeCents === 0
                  ? 'FREE'
                  : formatSgd(cents(order.deliveryFeeCents), { alwaysCents: true })
              }
            />
            <div className="flex justify-between gap-4 border-t border-line pt-3">
              <dt className="font-bold text-ink">Total</dt>
              <dd className="text-lg font-bold text-ink tnum">
                {formatSgd(cents(order.totalCents), { alwaysCents: true })}
              </dd>
            </div>
          </dl>
        </section>

        {paid ? (
          <section className="mt-7 rounded-[var(--radius-card)] bg-shell px-5 py-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
              What happens next
            </h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-body">
              <li>We prepare your order at our warehouse.</li>
              <li>A courier collects it and delivers to the address you gave.</li>
              <li>
                Contact us with your reference if you need an update — we do not send automatic
                updates.
              </li>
            </ol>
          </section>
        ) : null}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/shop">Continue shopping</ButtonLink>
          {!paid && !failed ? null : (
            <Link
              href="/contact"
              className="inline-flex h-11 items-center justify-center rounded-[var(--radius-control)] border border-line px-5 text-[0.95rem] font-semibold text-ink hover:bg-shell"
            >
              Contact us
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold text-ink tnum">{value}</dd>
    </div>
  )
}
