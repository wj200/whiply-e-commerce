import type { Metadata } from 'next'
import { ButtonLink } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Payment cancelled',
  robots: { index: false, follow: false },
}

export default function CancelledPage() {
  return (
    <div className="wrap max-w-xl py-20 text-center">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
        Payment wasn&apos;t completed
      </h1>
      <p className="mt-3 leading-relaxed text-muted">
        Nothing has been charged and your cart is exactly as you left it.
      </p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <ButtonLink href="/checkout">Try again</ButtonLink>
        <ButtonLink href="/cart" variant="secondary">
          Back to cart
        </ButtonLink>
      </div>
    </div>
  )
}
