import type { Metadata } from 'next'
import Link from 'next/link'
import { findOrderByReference } from '@/lib/domain/orders'
import { isValidReference } from '@/lib/domain/reference'
import { formatSgd, cents } from '@/lib/money'
import { ButtonLink } from '@/components/ui/button'
import { PaymentPoller } from '@/components/store/payment-poller'
import { formatSlotWithDate } from '@/lib/domain/delivery-slots'
import { methodLabel } from '@/lib/notify/order-summary'

export const metadata: Metadata = {
  title: 'Order confirmed',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * §6.6 — THE REDIRECT IS A HINT. This page reads the order and writes
 * nothing. A customer who closed the tab after paying still gets a fully
 * processed order; someone who crafts this URL sees whatever is actually true.
 */
export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>
}) {
  const { ref } = await searchParams

  if (!ref || !isValidReference(ref)) return <NotFound />

  const order = await findOrderByReference(ref)
  if (!order) return <NotFound reference={ref} />

  const paid = order.payment?.paymentStatus === 'PAID'
  const failed = order.payment?.paymentStatus === 'FAILED' || order.orderStatus === 'CANCELLED'

  return (
    <div className="wrap max-w-3xl py-16 lg:py-24">
      <p className="mono text-faint">
        {paid ? 'Order confirmed' : failed ? 'Payment not completed' : 'Confirming'}
      </p>

      <h1 className="display-sm mt-5 text-[clamp(1.9rem,4vw,2.75rem)]">
        {paid ? (
          <>
            Thank you.
            <br />
            <span className="display-echo">Your order is in.</span>
          </>
        ) : failed ? (
          'This order was not paid.'
        ) : (
          <>
            We&apos;re confirming
            <br />
            <span className="display-echo">your payment…</span>
          </>
        )}
      </h1>

      {!paid && !failed ? <PaymentPoller reference={order.reference} /> : null}

      <div className="mt-10 flex flex-wrap items-baseline justify-between gap-4 border-y border-line py-6">
        <p className="mono text-faint">Order reference</p>
        <p className="figure text-[1.25rem] font-semibold text-ink">{order.reference}</p>
      </div>

      <p className="mt-5 text-[0.9375rem] leading-relaxed text-body">
        <strong className="font-medium text-ink">Save this reference.</strong> WHIPLY does not use
        customer accounts, so this is how we find your order if you contact us.
        {paid ? ' A receipt is on its way to your email.' : null}
      </p>

      {order.deliverySlotStart && order.deliverySlotEnd ? (
        <div className="mt-8 border border-line-strong px-5 py-4">
          <p className="mono text-faint">Your delivery slot</p>
          <p className="mt-2 text-[1.0625rem] font-medium text-ink">
            {formatSlotWithDate({
              start: order.deliverySlotStart,
              end: order.deliverySlotEnd,
            })}
          </p>
          <p className="mt-1 text-[0.875rem] text-muted">{methodLabel(order.deliveryMethod)}</p>
        </div>
      ) : null}

      <section className="mt-12">
        <p className="mono border-b border-line pb-4 text-faint">What you ordered</p>
        <ul className="divide-y divide-line">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-4 py-4">
              <span className="text-[0.9375rem] text-body">
                <span className="figure text-ink">×{item.quantity}</span> {item.nameAtPurchase}
              </span>
              <span className="figure shrink-0 text-[0.9375rem] text-ink">
                {formatSgd(cents(item.lineTotalCents), { alwaysCents: true })}
              </span>
            </li>
          ))}
        </ul>

        <dl className="border-t border-line py-5 text-[0.9375rem]">
          <Row label="Subtotal" value={formatSgd(cents(order.subtotalCents), { alwaysCents: true })} />
          {order.discountCents > 0 ? (
            <Row
              label="Discount"
              value={`−${formatSgd(cents(order.discountCents), { alwaysCents: true })}`}
            />
          ) : null}
          <Row
            label={order.deliveryMethod === 'EXPRESS' ? 'Express delivery' : 'Standard delivery'}
            value={
              order.deliveryFeeCents === 0
                ? 'FREE'
                : formatSgd(cents(order.deliveryFeeCents), { alwaysCents: true })
            }
          />
        </dl>

        <div className="flex items-baseline justify-between border-t border-line py-5">
          <span className="text-[1.125rem] font-semibold tracking-[-0.02em] text-ink">Total</span>
          <span className="figure text-[1.5rem] font-semibold text-ink">
            {formatSgd(cents(order.totalCents), { alwaysCents: true })}
          </span>
        </div>
      </section>

      {paid ? (
        <section className="mt-12 bg-dark px-7 py-9 text-paper sm:px-10">
          <p className="mono text-dark-muted">What happens next</p>
          <ol className="mt-5 space-y-3 text-[0.9375rem] leading-relaxed text-paper/85">
            <li>
              <span className="figure text-dark-muted">01</span> &nbsp;A receipt is emailed to you,
              and we are told to start packing.
            </li>
            <li>
              <span className="figure text-dark-muted">02</span> &nbsp;We pack your order and set
              off in time for the slot you booked.
            </li>
            <li>
              <span className="figure text-dark-muted">03</span> &nbsp;If anything changes we call
              the mobile number on the order. For an update, contact us with your reference.
            </li>
          </ol>
        </section>
      ) : null}

      <div className="mt-12 flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/shop" arrow className="sm:min-w-[15rem]">
          Continue shopping
        </ButtonLink>
        <Link
          href="/contact"
          className="inline-flex h-12 items-center justify-center border border-line-strong px-6 text-[0.875rem] font-medium text-ink transition-colors hover:border-ink"
        >
          Contact us
        </Link>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="text-body">{label}</dt>
      <dd className="figure text-ink">{value}</dd>
    </div>
  )
}

function NotFound({ reference }: { reference?: string }) {
  return (
    <div className="wrap py-28 text-center">
      <h1 className="display-sm text-[2rem]">Order not found</h1>
      <p className="mt-4 text-muted">
        {reference ? (
          <>
            We have no order with reference <span className="figure text-ink">{reference}</span>.
          </>
        ) : (
          'Check the link, or contact us with your order reference.'
        )}
      </p>
      <ButtonLink href="/" arrow className="mt-9">
        Back to the shop
      </ButtonLink>
    </div>
  )
}
