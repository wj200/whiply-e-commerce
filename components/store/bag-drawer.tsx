'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useBag } from './bag-context'
import { useCart } from '@/lib/cart/context'
import { usePricedCart } from '@/lib/cart/use-priced-cart'
import { formatSgd, cents } from '@/lib/money'
import { productImageSrc } from '@/lib/media/product-image'
import { inputClasses } from '@/components/ui/field'
import { ButtonLink } from '@/components/ui/button'

/**
 * The bag. Slides in from the right and carries the items, the promo code
 * and a running total.
 *
 * It deliberately does NOT take delivery details or start a payment. The
 * flow is add to cart → checkout → pay, and putting the form in two places
 * means keeping two forms correct; the drawer hands over to /checkout with
 * any applied code in the URL.
 *
 * Totals here are indicative: delivery is priced at the standard rate until
 * the customer picks a speed on the checkout page. The figure shown is
 * always the server's (GUARD-1) — the drawer never adds up anything itself.
 */
export function BagDrawer() {
  const { isOpen, closeBag } = useBag()
  const [code, setCode] = useState<string | null>(null)
  const { data, loading, hydrated } = usePricedCart(code)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) panelRef.current?.focus()
  }, [isOpen])

  const isEmpty = hydrated && (!data || data.lines.length === 0)

  return (
    <>
      <div
        aria-hidden="true"
        onClick={closeBag}
        className={`fixed inset-0 z-50 bg-ink/45 transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Your bag"
        tabIndex={-1}
        className={`fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[34rem] flex-col bg-paper transition-transform duration-300 ease-out focus:outline-none ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-6 sm:px-8">
          <div>
            <p className="mono text-faint">Your next possibility</p>
            <h2 className="display-sm mt-2 text-[1.75rem]">
              The bag{' '}
              <span className="text-faint">({hydrated ? (data?.lines.length ?? 0) : 0})</span>
            </h2>
            <p className="mt-1 text-[0.875rem] text-muted">Singapore only. All amounts in SGD.</p>
          </div>
          <button
            type="button"
            onClick={closeBag}
            aria-label="Close bag"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink transition-colors hover:border-ink"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>

        {isEmpty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
            <p className="text-muted">Your bag is empty.</p>
            <ButtonLink href="/shop" onClick={closeBag} arrow>
              Shop all essentials
            </ButtonLink>
          </div>
        ) : !data ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="mono text-faint">Loading…</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 sm:px-8">
              <ul className="divide-y divide-line">
                {data.lines.map((line) => (
                  <BagLine key={line.sku} line={line} />
                ))}
              </ul>

              <PromoRow
                appliedCode={data.appliedCode?.code ?? null}
                codeError={data.codeError}
                onApply={setCode}
                onRemove={() => setCode(null)}
                disabled={loading}
              />

              <div className="border-t border-line py-6">
                <Row label="Subtotal" value={formatSgd(cents(data.subtotalCents), { alwaysCents: true })} />
                {data.discountCents > 0 ? (
                  <Row
                    label={`Discount (${data.appliedCode?.code ?? ''})`}
                    value={`−${formatSgd(cents(data.discountCents), { alwaysCents: true })}`}
                  />
                ) : null}
                <Row
                  label="Delivery"
                  value={
                    data.freeDeliveryApplied
                      ? 'FREE'
                      : formatSgd(cents(data.deliveryFeeCents), { alwaysCents: true })
                  }
                />
                <p className="mt-2 text-[0.8125rem] text-muted">
                  Standard rate shown. Express is{' '}
                  {formatSgd(cents(data.expressDeliveryFeeCents))}, and both are free above{' '}
                  {formatSgd(cents(data.freeDeliveryThresholdCents))} after discounts. Choose your
                  speed and slot at checkout.
                </p>
              </div>

              <div className="flex items-baseline justify-between border-t border-line pb-8 pt-6">
                <span className="text-[1.25rem] font-semibold tracking-[-0.02em] text-ink">
                  Estimated total
                </span>
                <span className="figure text-[1.5rem] font-semibold text-ink">
                  {formatSgd(cents(data.totalCents), { alwaysCents: true })}
                </span>
              </div>
            </div>

            <div className="sticky bottom-0 border-t border-line bg-paper px-6 py-5 sm:px-8">
              <Link
                href={data.appliedCode ? `/checkout?code=${encodeURIComponent(data.appliedCode.code)}` : '/checkout'}
                onClick={closeBag}
                aria-disabled={loading}
                className="flex h-[3.5rem] w-full items-center justify-between bg-ink px-6 text-[0.9375rem] font-medium text-paper transition-colors hover:bg-body"
              >
                Checkout
                <span className="figure">
                  {formatSgd(cents(data.totalCents), { alwaysCents: true })}
                </span>
              </Link>
              <p className="mt-3 text-center text-[0.75rem] text-muted">
                Next: delivery details, your slot, and PayNow.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function BagLine({
  line,
}: {
  line: {
    sku: string
    name: string
    slug: string
    imageUrl: string | null
    unitPriceCents: number
    quantity: number
    lineTotalCents: number
    shortDesc?: string | null
  }
}) {
  const { setQty, remove } = useCart()

  return (
    <li className="flex gap-4 py-6">
      <div className="relative h-24 w-20 shrink-0 overflow-hidden bg-frame">
        <Image
          src={productImageSrc({ sku: line.sku, imageUrl: line.imageUrl })}
          alt=""
          fill
          sizes="80px"
          className="object-cover"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.9375rem] font-medium leading-snug text-ink">{line.name}</p>
            {line.shortDesc ? (
              <p className="mt-1 text-[0.8125rem] text-muted">{line.shortDesc}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => remove(line.sku)}
            aria-label={`Remove ${line.name}`}
            className="shrink-0 p-1 text-faint transition-colors hover:text-ink"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2h5.8l.6-8.2" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex h-10 items-stretch border border-line-strong">
            <button
              type="button"
              onClick={() => setQty(line.sku, line.quantity - 1)}
              aria-label={`Decrease quantity of ${line.name}`}
              className="w-10 text-ink transition-colors hover:bg-veil"
            >
              −
            </button>
            <span className="figure flex w-10 items-center justify-center border-x border-line-strong text-[0.875rem] text-ink">
              {line.quantity}
            </span>
            <button
              type="button"
              onClick={() => setQty(line.sku, line.quantity + 1)}
              aria-label={`Increase quantity of ${line.name}`}
              className="w-10 text-ink transition-colors hover:bg-veil"
            >
              +
            </button>
          </div>
          <span className="figure text-[0.9375rem] text-ink">
            {formatSgd(cents(line.lineTotalCents), { alwaysCents: true })}
          </span>
        </div>
      </div>
    </li>
  )
}

function PromoRow({
  appliedCode,
  codeError,
  onApply,
  onRemove,
  disabled,
}: {
  appliedCode: string | null
  codeError: string | null
  onApply: (code: string) => void
  onRemove: () => void
  disabled?: boolean
}) {
  const [value, setValue] = useState('')

  return (
    <div className="border-t border-line py-6">
      <p className="mono mb-3 text-faint">Promo protocol</p>

      {appliedCode ? (
        <div className="flex items-center justify-between gap-3 border border-line-strong px-3.5 py-3">
          <p className="figure text-[0.875rem] text-ink">{appliedCode} applied</p>
          <button
            type="button"
            onClick={onRemove}
            className="mono-sm text-muted underline underline-offset-2 hover:text-ink"
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="flex">
          <input
            aria-label="Voucher code"
            placeholder="ENTER VOUCHER CODE"
            value={value}
            disabled={disabled}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (value.trim()) onApply(value.trim())
              }
            }}
            aria-invalid={codeError ? true : undefined}
            className={`${inputClasses} figure border-r-0 uppercase placeholder:text-faint`}
          />
          <button
            type="button"
            disabled={disabled || !value.trim()}
            onClick={() => onApply(value.trim())}
            className="h-12 shrink-0 bg-faint px-6 text-[0.875rem] font-medium text-pure transition-colors hover:bg-ink disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      )}

      {codeError ? (
        <p role="alert" className="mono-sm mt-2.5 text-[#9c3b2b]">
          {codeError}
        </p>
      ) : null}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-[0.9375rem] text-body">{label}</span>
      <span className="figure text-[0.9375rem] text-ink">{value}</span>
    </div>
  )
}
