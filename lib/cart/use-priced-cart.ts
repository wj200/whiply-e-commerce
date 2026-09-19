'use client'

import * as React from 'react'
import { useCart } from './context'

export type PricedLineDto = {
  sku: string
  name: string
  slug: string
  shortDesc: string | null
  imageUrl: string | null
  unitPriceCents: number
  quantity: number
  lineTotalCents: number
}

export type PricedCartDto = {
  lines: PricedLineDto[]
  subtotalCents: number
  discountCents: number
  deliveryFeeCents: number
  totalCents: number
  freeDeliveryApplied: boolean
  amountToFreeDeliveryCents: number
  baseDeliveryFeeCents: number
  freeDeliveryThresholdCents: number
  appliedCode: { id: string; code: string } | null
  issues: { sku: string; kind: string; message: string; availableQty?: number }[]
  codeError: string | null
}

/**
 * Every render of the cart re-prices on the SERVER. The cart a customer left
 * open overnight shows this morning's prices (§5.1), and a line that went out
 * of stock is corrected here rather than at payment.
 */
export function usePricedCart(code: string | null) {
  const { cart, hydrated, remove, setQty } = useCart()
  const [data, setData] = React.useState<PricedCartDto | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const requestId = React.useRef(0)

  const lines = React.useMemo(
    () => cart.lines.map((l) => ({ sku: l.sku, qty: l.qty })),
    [cart.lines],
  )

  React.useEffect(() => {
    if (!hydrated) return

    if (lines.length === 0) {
      setData(null)
      setLoading(false)
      return
    }

    const id = ++requestId.current
    setLoading(true)

    fetch('/api/cart/price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines, code }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`price failed: ${res.status}`)
        return (await res.json()) as PricedCartDto
      })
      .then((priced) => {
        if (id !== requestId.current) return
        setData(priced)
        setError(null)

        // Reconcile the browser cart with what the server says is buyable.
        for (const issue of priced.issues) {
          if (issue.kind === 'UNKNOWN' || issue.kind === 'UNAVAILABLE') {
            remove(issue.sku)
          } else if (issue.kind === 'INSUFFICIENT_STOCK') {
            if (issue.availableQty && issue.availableQty > 0) setQty(issue.sku, issue.availableQty)
            else remove(issue.sku)
          }
        }
      })
      .catch(() => {
        if (id !== requestId.current) return
        setError('We could not refresh your cart. Please try again.')
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false)
      })
    // `remove`/`setQty` are stable enough for this effect; including them would
    // re-fire the request on every cart mutation they cause.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(lines), code, hydrated])

  return { data, loading, error, isEmpty: hydrated && lines.length === 0, hydrated }
}
