'use client'

import { useState } from 'react'
import { useCart } from '@/lib/cart/context'
import { useBag } from './bag-context'
import { MAX_QTY_PER_LINE } from '@/lib/cart/types'

export function ProductActions({
  sku,
  name,
  inStock,
}: {
  sku: string
  name: string
  inStock: boolean
}) {
  const [qty, setQty] = useState(1)
  const { add } = useCart()
  const { openBag } = useBag()

  function clamp(n: number) {
    if (!Number.isFinite(n)) return 1
    return Math.min(Math.max(Math.floor(n), 1), MAX_QTY_PER_LINE)
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div className="flex h-[3.5rem] shrink-0 items-stretch border border-line-strong">
        <button
          type="button"
          disabled={!inStock || qty <= 1}
          onClick={() => setQty(clamp(qty - 1))}
          aria-label={`Decrease quantity of ${name}`}
          className="w-14 text-[1.1rem] text-ink transition-colors hover:bg-veil disabled:opacity-35"
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_QTY_PER_LINE}
          value={qty}
          disabled={!inStock}
          aria-label={`Quantity for ${name}`}
          onChange={(e) => setQty(clamp(Number(e.target.value)))}
          className="figure w-14 border-x border-line-strong bg-transparent text-center text-[0.9375rem] text-ink focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          disabled={!inStock || qty >= MAX_QTY_PER_LINE}
          onClick={() => setQty(clamp(qty + 1))}
          aria-label={`Increase quantity of ${name}`}
          className="w-14 text-[1.1rem] text-ink transition-colors hover:bg-veil disabled:opacity-35"
        >
          +
        </button>
      </div>

      <button
        type="button"
        disabled={!inStock}
        onClick={() => {
          add(sku, qty)
          openBag()
        }}
        className="flex h-[3.5rem] flex-1 items-center justify-center bg-ink px-8 text-[0.9375rem] font-medium text-paper transition-colors hover:bg-body disabled:cursor-not-allowed disabled:opacity-40"
      >
        {inStock ? 'Add to bag' : 'Out of stock'}
      </button>
    </div>
  )
}
