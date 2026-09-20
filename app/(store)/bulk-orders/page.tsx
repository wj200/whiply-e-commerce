import type { Metadata } from 'next'
import { BulkEnquiryForm } from '@/components/store/bulk-enquiry-form'
import { ArrowUpRight } from '@/components/ui/arrow'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Bulk orders',
  description:
    'Ordering for a kitchen? Tell us what you need and we will come back to you with trade pricing.',
}

export default function BulkOrdersPage() {
  const siteKey = process.env.TURNSTILE_SITE_KEY ?? null

  return (
    <>
      <div className="wrap grid gap-14 pb-20 pt-12 lg:grid-cols-2 lg:gap-20 lg:pt-16">
        <div>
          <p className="mono text-ink">02 / For the bigger batch</p>

          <h1 className="display mt-7 text-[clamp(2.4rem,5.2vw,3.9rem)]">
            Ordering for
            <br />
            <span className="display-echo">a kitchen?</span>
          </h1>

          <p className="mt-8 max-w-md text-[1.0625rem] leading-relaxed text-body">
            Tell us what you need and we will come back to you directly with trade pricing. No
            account, no minimum, no automated quote.
          </p>

          <dl className="mt-12 border-t border-line">
            {[
              {
                n: '01',
                t: 'You leave your details',
                d: 'Name, number, email and roughly what you need.',
              },
              {
                n: '02',
                t: 'A person reads it',
                d: 'No automated quote, no drip campaign, no mailing list.',
              },
              {
                n: '03',
                t: 'We come back to you',
                d: 'With pricing for the volume and cadence you actually want.',
              },
            ].map((step) => (
              <div key={step.n} className="grid gap-2 border-b border-line py-6 sm:grid-cols-[4rem_1fr]">
                <dt className="mono text-faint">{step.n}</dt>
                <dd>
                  <p className="text-[1rem] font-medium text-ink">{step.t}</p>
                  <p className="mt-1 text-[0.9375rem] text-muted">{step.d}</p>
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-8 text-[0.9375rem] leading-relaxed text-muted">
            Buying chargers in volume? Our{' '}
            <Link
              href="/policies/usage"
              className="group inline-flex items-center gap-1 text-body underline underline-offset-4 hover:text-ink"
            >
              culinary usage agreement
              <ArrowUpRight size={11} />
            </Link>{' '}
            applies to every order, whatever the quantity.
          </p>
        </div>

        <div className="lg:pt-4">
          <div className="border border-line bg-pure px-6 py-8 sm:px-9 sm:py-10">
            <p className="mono text-faint">Bulk order enquiry</p>
            <h2 className="display-sm mt-4 text-[1.5rem]">Leave your details.</h2>
            <p className="mt-2 text-[0.9375rem] text-muted">
              We will contact you. We never add you to a mailing list.
            </p>

            <div className="mt-8">
              <BulkEnquiryForm turnstileSiteKey={siteKey} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
