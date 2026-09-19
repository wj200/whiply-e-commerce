import Link from 'next/link'
import { ArrowUpRight } from '@/components/ui/arrow'

/**
 * GUARD-6 in the interface: the intended-use framing is stated wherever
 * chargers are sold, not buried in a footer.
 */
export function UsageNote() {
  return (
    <div className="flex items-start gap-3 text-[0.9375rem] text-muted">
      <InfoIcon />
      <p className="leading-relaxed">
        Cream chargers are for culinary use only. A little responsibility goes a long way.{' '}
        <Link
          href="/policies/usage"
          className="group inline-flex items-center gap-1 text-body underline underline-offset-4 hover:text-ink"
        >
          Read our usage agreement
          <ArrowUpRight size={11} className="transition-transform group-hover:-translate-y-px" />
        </Link>
      </p>
    </div>
  )
}

function InfoIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 20 20"
      className="mt-0.5 shrink-0 text-faint"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="7.6" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M10 9v5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="10" cy="6.4" r="0.9" fill="currentColor" />
    </svg>
  )
}
