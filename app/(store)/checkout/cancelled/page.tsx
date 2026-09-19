import type { Metadata } from 'next'
import { ButtonLink } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Payment cancelled',
  robots: { index: false, follow: false },
}

export default function CancelledPage() {
  return (
    <div className="wrap max-w-2xl py-28 text-center">
      <p className="mono text-faint">Nothing was charged</p>
      <h1 className="display-sm mt-5 text-[clamp(1.9rem,4vw,2.5rem)]">
        Payment wasn&apos;t completed.
      </h1>
      <p className="mt-5 leading-relaxed text-muted">
        Your bag is exactly as you left it.
      </p>
      <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
        <ButtonLink href="/checkout" arrow className="sm:min-w-[14rem]">
          Try again
        </ButtonLink>
        <ButtonLink href="/shop" variant="secondary" className="sm:min-w-[14rem]">
          Continue shopping
        </ButtonLink>
      </div>
    </div>
  )
}
