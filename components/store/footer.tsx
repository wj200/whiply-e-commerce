import Link from 'next/link'
import { Wordmark } from './wordmark'
import { ArrowUpRight } from '@/components/ui/arrow'

const COLUMNS = [
  {
    heading: 'The collection',
    links: [
      { href: '/shop', label: 'Shop all essentials', arrow: true },
      { href: '/baking-equipment', label: 'Scales & mixers' },
      { href: '/cream-chargers', label: 'Cream chargers' },
      { href: '/bulk-orders', label: 'Bulk orders' },
    ],
  },
  {
    heading: 'The details',
    links: [
      { href: '/policies/delivery', label: 'Delivery in Singapore' },
      { href: '/policies/usage', label: 'Culinary usage agreement' },
      { href: '/policies/terms', label: 'Terms & conditions' },
      { href: '/policies/returns', label: 'Returns & refunds' },
      { href: '/policies/privacy', label: 'Privacy' },
    ],
  },
]

export function Footer() {
  return (
    <footer className="mt-4 border-t border-line">
      <div className="wrap grid gap-14 py-16 lg:grid-cols-[1.3fr_1fr_1fr_1fr] lg:gap-10 lg:py-20">
        <div>
          <Wordmark size="lg" />
          <p className="mt-6 text-[1rem] text-body">For kitchens with possibilities.</p>
          <p className="mono mt-10 text-faint">Based in Singapore. Made for more.</p>
        </div>

        {COLUMNS.map((column) => (
          <div key={column.heading}>
            <p className="mono text-faint">{column.heading}</p>
            <ul className="mt-5 space-y-3.5">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="group inline-flex items-center gap-1.5 text-[0.9375rem] text-body transition-colors hover:text-ink"
                  >
                    {link.label}
                    {'arrow' in link && link.arrow ? (
                      <ArrowUpRight size={12} className="transition-transform group-hover:-translate-y-px" />
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <p className="mono text-faint">Good to know</p>
          <ul className="mt-5 space-y-3.5 text-[0.9375rem] text-muted">
            <li>All prices in Singapore dollars.</li>
            <li>PayNow checkout via Stripe. No card details, ever.</li>
            <li>No account needed — keep your order reference.</li>
            <li>
              <Link href="/contact" className="text-body underline underline-offset-4 hover:text-ink">
                Questions? Get in touch.
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="wrap flex flex-col gap-2 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="mono-sm text-faint">© {new Date().getFullYear()} WHIPLY</p>
          <p className="mono-sm text-faint">Singapore</p>
        </div>
      </div>
    </footer>
  )
}
