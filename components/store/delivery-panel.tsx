import Link from 'next/link'
import { formatSgd, cents } from '@/lib/money'
import { ArrowUpRight } from '@/components/ui/arrow'

/**
 * The dark panel. Every figure renders FROM SETTINGS — changing a fee, the
 * free-delivery threshold or the ordering cutoff in the admin panel changes
 * this section with no deploy (§4.5).
 *
 * The copy describes what is actually built: WHIPLY delivers its own orders
 * in booked slots, so it promises a window the operator controls rather than
 * a courier's availability.
 */
export function DeliveryPanel({
  standardDeliveryFeeCents,
  expressDeliveryFeeCents,
  freeDeliveryThresholdCents,
}: {
  standardDeliveryFeeCents: number
  expressDeliveryFeeCents: number
  freeDeliveryThresholdCents: number
}) {
  return (
    <section className="wrap py-10 lg:py-16">
      <div className="bg-dark px-7 py-14 text-paper sm:px-12 lg:px-16 lg:py-20">
        <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <p className="mono text-dark-muted">01 / Less waiting. More creating.</p>

            <h2 className="display mt-7 text-[clamp(1.75rem,3.05vw,2.6rem)] text-paper">
              Your kitchen doesn&apos;t wait.
              <br />
              <span className="text-dark-muted">Neither should your delivery.</span>
            </h2>

            <p className="mt-7 max-w-md text-[1rem] leading-relaxed text-paper/75">
              Last-minute service. An unexpected big batch. Pick a one-hour window and we build the
              run around it.
            </p>

            <div className="mt-9 flex items-center gap-3">
              <TruckIcon />
              <p className="mono text-paper/85">
                Slots 10am–11pm <span className="text-dark-muted">/ seven days</span>
              </p>
            </div>

            <p className="mt-5 max-w-md text-[0.8125rem] leading-relaxed text-dark-muted">
              Book at least an hour before your slot. Orders close at 10pm and reopen at 10am.
            </p>
          </div>

          <div>
            <div className="border-b border-dark-line pb-8">
              <p className="mono text-dark-muted">01 — Two speeds</p>

              <div className="mt-5 flex items-baseline justify-between gap-6">
                <div>
                  <p className="figure text-[2.1rem] font-semibold leading-none text-paper">
                    {formatSgd(cents(standardDeliveryFeeCents))}
                  </p>
                  <p className="mono mt-2 text-dark-muted">Standard</p>
                </div>
                <p className="text-[0.9375rem] text-paper/70">2–3 working days</p>
              </div>

              <div className="mt-7 flex items-baseline justify-between gap-6">
                <div>
                  <p className="figure text-[2.1rem] font-semibold leading-none text-paper">
                    {formatSgd(cents(expressDeliveryFeeCents))}
                  </p>
                  <p className="mono mt-2 text-dark-muted">Express</p>
                </div>
                <p className="text-[0.9375rem] text-paper/70">Within 2 hours</p>
              </div>
            </div>

            <div className="border-b border-dark-line py-8">
              <p className="mono text-dark-muted">02 — Free above {formatSgd(cents(freeDeliveryThresholdCents))}</p>
              <div className="mt-4 flex items-start justify-between gap-6">
                <h3 className="text-[1.5rem] font-semibold tracking-[-0.025em] text-paper">
                  Express, on us.
                </h3>
                <Link
                  href="/policies/delivery"
                  aria-label="Read the delivery policy"
                  className="mt-1 shrink-0 text-paper/70 transition-colors hover:text-paper"
                >
                  <ArrowUpRight size={18} />
                </Link>
              </div>
              <p className="mt-3 text-[0.9375rem] text-paper/70">
                Orders of {formatSgd(cents(freeDeliveryThresholdCents))} or more ship free at either
                speed — express included. Assessed after any discount.
              </p>
            </div>

            <p className="mono mt-8 flex items-center gap-2.5 text-paper/80">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-sage" aria-hidden="true" />
              Singapore only, for now. Delivery only — no self-collection.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function TruckIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" className="shrink-0 text-paper" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.2" fill="none">
        <path d="M2.5 6.5h11v9h-11z" />
        <path d="M13.5 9.5h4l3 3v3h-7z" />
        <circle cx="7" cy="17.5" r="1.7" />
        <circle cx="17" cy="17.5" r="1.7" />
      </g>
    </svg>
  )
}
