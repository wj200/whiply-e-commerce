'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { QuantityStepper } from './quantity-stepper'
import { useCart } from '@/lib/cart/context'

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
  const [added, setAdded] = useState(false)
  const { add, buyNow } = useCart()
  const router = useRouter()

  return (
    <div className="flex flex-col gap-3">
      <div className="max-w-[10rem]">
        <QuantityStepper
          value={qty}
          onChange={setQty}
          disabled={!inStock}
          label={`Quantity for ${name}`}
        />
      </div>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <Button
          size="lg"
          disabled={!inStock}
          aria-live="polite"
          className="sm:flex-1"
          onClick={() => {
            add(sku, qty)
            setAdded(true)
            window.setTimeout(() => setAdded(false), 1600)
          }}
        >
          {added ? 'Added to cart ✓' : 'Add to Cart'}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          disabled={!inStock}
          className="sm:flex-1"
          onClick={() => {
            buyNow(sku, qty)
            router.push('/checkout')
          }}
        >
          Buy Now
        </Button>
      </div>
    </div>
  )
}
