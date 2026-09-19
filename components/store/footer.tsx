import Link from 'next/link'
import { formatSgd, cents } from '@/lib/money'

export function Footer({
  deliveryFeeCents,
  freeDeliveryThresholdCents,
}: {
  deliveryFeeCents: number
  freeDeliveryThresholdCents: number
}) {
  return (
    <footer className="mt-20 border-t border-line bg-shell">
      <div className="wrap grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-xl font-bold text-ink">WHIPLY</p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
            Professional baking and culinary supply. Food-grade N₂O cream chargers and
            equipment, delivered across Singapore.
          </p>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-faint">Shop</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/cream-chargers" className="text-body hover:text-accent">
                Cream Chargers
              </Link>
            </li>
            <li>
              <Link href="/baking-equipment" className="text-body hover:text-accent">
                Baking Equipment
              </Link>
            </li>
            <li>
              <Link href="/bulk-orders" className="text-body hover:text-accent">
                Bulk Orders
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-faint">Company</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/about" className="text-body hover:text-accent">
                About
              </Link>
            </li>
            <li>
              <Link href="/contact" className="text-body hover:text-accent">
                Contact
              </Link>
            </li>
            <li>
              <Link href="/policies/delivery" className="text-body hover:text-accent">
                Delivery Policy
              </Link>
            </li>
            <li>
              <Link href="/policies/returns" className="text-body hover:text-accent">
                Returns &amp; Refunds
              </Link>
            </li>
            <li>
              <Link href="/policies/terms" className="text-body hover:text-accent">
                Terms of Sale
              </Link>
            </li>
            <li>
              <Link href="/policies/privacy" className="text-body hover:text-accent">
                Privacy Notice
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-faint">Delivery</p>
          <p className="mt-3 text-sm leading-relaxed text-body">
            Free delivery on orders{' '}
            <strong className="text-ink">
              {formatSgd(cents(freeDeliveryThresholdCents))}+
            </strong>
            .<br />
            Below that, a flat{' '}
            <strong className="text-ink">{formatSgd(cents(deliveryFeeCents))}</strong> applies.
          </p>
          <p className="mt-2 text-sm text-muted">Delivery only — no self-collection.</p>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="wrap flex flex-col gap-1 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} WHIPLY. All rights reserved.</p>
          <p>Singapore</p>
        </div>
      </div>
    </footer>
  )
}
