'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * §6.6 — polls for up to 60 seconds, then tells the customer their reference
 * and that confirmation follows. It WRITES NOTHING; it only asks the server
 * what is already true.
 */
const INTERVAL_MS = 2000
const MAX_ATTEMPTS = 30

export function PaymentPoller({ reference }: { reference: string }) {
  const router = useRouter()
  const [gaveUp, setGaveUp] = useState(false)

  useEffect(() => {
    let attempts = 0
    let cancelled = false

    const timer = setInterval(async () => {
      attempts += 1
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(timer)
        if (!cancelled) setGaveUp(true)
        return
      }

      try {
        const res = await fetch(`/api/orders/${reference}/status`, { cache: 'no-store' })
        if (!res.ok) return
        const body = (await res.json()) as { paymentStatus: string }
        if (body.paymentStatus !== 'PENDING') {
          clearInterval(timer)
          if (!cancelled) router.refresh()
        }
      } catch {
        /* keep polling — a transient network blip is not a failure */
      }
    }, INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [reference, router])

  return (
    <p className="mt-3 text-[0.95rem] leading-relaxed text-muted" aria-live="polite">
      {gaveUp
        ? 'This is taking longer than usual. Your payment may still be processing — keep your reference and contact us if it does not confirm shortly.'
        : 'Payment providers confirm server-to-server, so this can take a few seconds. You can safely close this page.'}
    </p>
  )
}
