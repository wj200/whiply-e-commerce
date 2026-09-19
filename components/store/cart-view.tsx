'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { useCart } from '@/lib/cart/context'
import { usePricedCart } from '@/lib/cart/use-priced-cart'
import { formatSgd, cents } from '@/lib/money'
import { productImageSrc } from '@/lib/media/product-image'
import { QuantityStepper } from './quantity-stepper'
import { OrderSummary } from './order-summary'
import { PromoCodeField } from './promo-code-field'
import { ButtonLink } from '@/components/ui/button'

export function CartView() {
  const { setQty, remove } = useCart()
  const [code, setCode] = useState<string | null>(null)
  const { data, loading, error, isEmpty, hydrated } = usePricedCart(code)

  if (!hydrated || (loading && !data)) {
    return (
      <div className="wrap py-20">
        <p className="text-muted">Loading your cart…</p>
      </div>
    )
  }

  if (isEmpty || !data || data.lines.length === 0) {
    return (
      <div className="wrap py-20 text-center">
        <h1 className="font-display text-3xl font-bold text-ink">Your cart is empty</h1>
        <p className="mt-3 text-muted">Nothing added yet.</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href="/cream-chargers">Shop Cream Chargers</ButtonLink>
          <ButtonLink href="/baking-equipment" variant="secondary">
            Shop Baking Equipment
          </ButtonLink>
        </div>
      </div>
    )
  }

  const appliedCode = data.appliedCode?.code ?? null

  return (
    <div className="wrap py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">
        Your cart
      </h1>

      {error ? (
        <p role="alert" className="mt-4 rounded-[var(--radius-control)] bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {data.issues.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {data.issues.map((issue) => (
            <li
              key={`${issue.sku}-${issue.kind}`}
              role="status"
              className="rounded-[var(--radius-control)] bg-warn-soft px-4 py-3 text-sm text-warn"
            >
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem] lg:gap-12">
        <section aria-label="Items">
          <ul className="divide-y divide-line border-y border-line">
            {data.lines.map((line) => (
              <li key={line.sku} className="flex gap-4 py-5">
                <Link
                  href={`/product/${line.slug}`}
                  className="relative h-24 w-20 shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-line bg-shell"
                >
                  <Image
                    src={productImageSrc({ sku: line.sku, imageUrl: line.imageUrl })}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </Link>

                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-[0.95rem] font-semibold leading-snug text-ink">
                        <Link href={`/product/${line.slug}`} className="hover:text-accent">
                          {line.name}
                        </Link>
                      </h2>
                      <p className="mt-0.5 text-sm text-muted tnum">
                        {formatSgd(cents(line.unitPriceCents))} each
                      </p>
                    </div>
                    <p className="shrink-0 font-bold text-ink tnum">
                      {formatSgd(cents(line.lineTotalCents), { alwaysCents: true })}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-32">
                      <QuantityStepper
                        size="sm"
                        value={line.quantity}
                        onChange={(n) => setQty(line.sku, n)}
                        label={`Quantity for ${line.name}`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(line.sku)}
                      className="text-sm font-medium text-muted underline underline-offset-2 hover:text-danger hover:no-underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6">
            <Link href="/shop" className="text-sm font-semibold text-accent hover:text-accent-hover">
              ← Continue shopping
            </Link>
          </div>
        </section>

        <aside aria-label="Order summary" className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[var(--radius-card)] border border-line bg-shell p-5">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted">
              Order summary
            </h2>

            <div className="mb-5">
              <PromoCodeField
                appliedCode={appliedCode}
                codeError={data.codeError}
                onApply={setCode}
                onRemove={() => setCode(null)}
                disabled={loading}
              />
            </div>

            <OrderSummary
              subtotalCents={data.subtotalCents}
              discountCents={data.discountCents}
              deliveryFeeCents={data.deliveryFeeCents}
              totalCents={data.totalCents}
              freeDeliveryApplied={data.freeDeliveryApplied}
              amountToFreeDeliveryCents={data.amountToFreeDeliveryCents}
              appliedCodeLabel={appliedCode}
            />

            <ButtonLink href="/checkout" size="lg" className="mt-5 w-full">
              Checkout
            </ButtonLink>

            <p className="mt-3 text-center text-xs text-muted">
              Delivery only — no self-collection.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
