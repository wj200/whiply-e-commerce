'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { useCart } from '@/lib/cart/context'
import { usePricedCart } from '@/lib/cart/use-priced-cart'
import { formatSgd, cents } from '@/lib/money'
import { productImageSrc } from '@/lib/media/product-image'
import { CheckoutFields, type FieldErrors } from './checkout-fields'
import { DeliveryPicker } from './delivery-picker'
import { ButtonLink } from '@/components/ui/button'
import { inputClasses } from '@/components/ui/field'

/**
 * Blueprint §6.1 — THE CHECKOUT PAGE.
 *
 * The only surface that takes delivery details and starts a payment. The bag
 * drawer collects items and a code and then sends the customer here, so
 * there is exactly one form to keep correct.
 *
 * Nothing on this page decides money. Every figure shown comes from
 * /api/cart/price, and the total the customer is charged is recomputed once
 * more server-side when the order is created (GUARD-1). Changing the
 * delivery speed re-prices on the server rather than adding a fee in the
 * browser.
 */
export function CheckoutView({ initialCode }: { initialCode?: string | null }) {
  const { cart } = useCart()
  const [code, setCode] = useState<string | null>(initialCode?.trim() || null)
  const [codeInput, setCodeInput] = useState('')
  const [method, setMethod] = useState<'STANDARD' | 'EXPRESS'>('STANDARD')
  const [slotStart, setSlotStart] = useState<string | null>(null)

  const { data, loading, isEmpty, hydrated } = usePricedCart(code, method)

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [slotError, setSlotError] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setFormError(null)
    setSlotError(null)
    setErrors({})

    if (!slotStart) {
      setSlotError('Choose a delivery slot.')
      return
    }

    const form = new FormData(event.currentTarget)
    const contact = {
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
      phone: String(form.get('phone') ?? ''),
      addressLine1: String(form.get('addressLine1') ?? ''),
      addressLine2: String(form.get('addressLine2') ?? ''),
      postalCode: String(form.get('postalCode') ?? ''),
      instructions: String(form.get('instructions') ?? ''),
    }

    setSubmitting(true)

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: cart.lines,
          contact,
          delivery: { method, slotStart },
          code,
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      const body = (await res.json()) as {
        checkoutUrl?: string
        error?: string
        field?: string
        issues?: { path: string; message: string }[]
      }

      if (!res.ok) {
        if (body.field === 'delivery.slotStart') {
          // The slot went stale between rendering and submitting. Clearing it
          // forces a fresh pick rather than a retry of the same bad one.
          setSlotStart(null)
          setSlotError(body.error ?? 'That slot is no longer available.')
          setSubmitting(false)
          return
        }
        if (body.issues?.length) {
          const next: FieldErrors = {}
          for (const issue of body.issues) {
            const key = issue.path.replace(/^contact\./, '')
            if (!next[key]) next[key] = issue.message
          }
          setErrors(next)
        }
        setFormError(body.error ?? 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }

      if (body.checkoutUrl) {
        window.location.href = body.checkoutUrl
        return
      }
      setFormError('Payment could not be started. Please try again.')
      setSubmitting(false)
    } catch {
      setFormError('We could not reach the server. Please try again.')
      setSubmitting(false)
    }
  }

  if (!hydrated || (loading && !data)) {
    return (
      <div className="wrap py-28">
        <p className="mono text-faint">Loading…</p>
      </div>
    )
  }

  if (isEmpty || !data || data.lines.length === 0) {
    return (
      <div className="wrap py-28 text-center">
        <h1 className="display-sm text-[2rem]">Nothing to check out</h1>
        <p className="mt-4 text-muted">Your bag is empty.</p>
        <ButtonLink href="/shop" arrow className="mt-9">
          Shop all essentials
        </ButtonLink>
      </div>
    )
  }

  return (
    <div className="wrap py-12 lg:py-16">
      <p className="mono text-faint">Your next possibility</p>
      <h1 className="display-sm mt-5 text-[clamp(1.9rem,3.6vw,2.75rem)]">Delivery details</h1>
      <p className="mt-4 text-[0.9375rem] text-muted">
        Singapore only. All amounts in SGD. No account needed —{' '}
        <strong className="font-medium text-ink">keep your order reference</strong> after payment.
      </p>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="mt-12 grid gap-14 lg:grid-cols-[1fr_24rem] lg:gap-16"
      >
        <div>
          <CheckoutFields errors={errors} />

          <div className="mt-10 border-t border-line pt-9">
            <DeliveryPicker
              method={method}
              onMethodChange={setMethod}
              slotStart={slotStart}
              onSlotChange={setSlotStart}
              standardFeeCents={data.standardDeliveryFeeCents}
              expressFeeCents={data.expressDeliveryFeeCents}
              freeDeliveryApplied={data.freeDeliveryApplied}
              error={slotError}
            />
          </div>

          <p className="mono mt-8 border-t border-line pt-6 text-faint">
            Delivery only — no self-collection.
          </p>
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <p className="mono border-b border-line pb-4 text-faint">Order summary</p>

          <ul className="divide-y divide-line">
            {data.lines.map((line) => (
              <li key={line.sku} className="flex gap-4 py-5">
                <div className="relative h-20 w-16 shrink-0 overflow-hidden bg-frame">
                  <Image
                    src={productImageSrc({ sku: line.sku, imageUrl: line.imageUrl })}
                    alt=""
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                </div>
                <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.9375rem] font-medium leading-snug text-ink">
                      {line.name}
                    </p>
                    <p className="figure mt-1 text-[0.8125rem] text-muted">×{line.quantity}</p>
                  </div>
                  <p className="figure shrink-0 text-[0.9375rem] text-ink">
                    {formatSgd(cents(line.lineTotalCents), { alwaysCents: true })}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="border-t border-line py-6">
            <p className="mono mb-3 text-faint">Promo protocol</p>
            {data.appliedCode ? (
              <div className="flex items-center justify-between gap-3 border border-line-strong px-3.5 py-3">
                <p className="figure text-[0.875rem] text-ink">{data.appliedCode.code} applied</p>
                <button
                  type="button"
                  onClick={() => {
                    setCode(null)
                    setCodeInput('')
                  }}
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
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  className={`${inputClasses} figure border-r-0 uppercase`}
                />
                <button
                  type="button"
                  disabled={!codeInput.trim()}
                  onClick={() => setCode(codeInput.trim())}
                  className="h-12 shrink-0 bg-faint px-5 text-[0.875rem] font-medium text-pure transition-colors hover:bg-ink disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
            )}
            {data.codeError ? (
              <p role="alert" className="mono-sm mt-2.5 text-[#9c3b2b]">
                {data.codeError}
              </p>
            ) : null}
          </div>

          <div className="border-t border-line py-6">
            <SummaryRow
              label="Subtotal"
              value={formatSgd(cents(data.subtotalCents), { alwaysCents: true })}
            />
            {data.discountCents > 0 ? (
              <SummaryRow
                label="Discount"
                value={`−${formatSgd(cents(data.discountCents), { alwaysCents: true })}`}
              />
            ) : null}
            <SummaryRow
              label={method === 'EXPRESS' ? 'Express delivery' : 'Standard delivery'}
              value={
                data.freeDeliveryApplied
                  ? 'FREE'
                  : formatSgd(cents(data.deliveryFeeCents), { alwaysCents: true })
              }
            />
            <p className="mt-2 text-[0.8125rem] text-muted">
              {data.freeDeliveryApplied ? (
                <>
                  Free at {formatSgd(cents(data.freeDeliveryThresholdCents))} and above — express
                  included.
                </>
              ) : (
                <>
                  {formatSgd(cents(data.amountToFreeDeliveryCents), { alwaysCents: true })} more for
                  free delivery at either speed.
                </>
              )}
            </p>
          </div>

          <div className="flex items-baseline justify-between border-t border-line py-6">
            <span className="text-[1.125rem] font-semibold tracking-[-0.02em] text-ink">
              Total to pay
            </span>
            <span className="figure text-[1.375rem] font-semibold text-ink">
              {formatSgd(cents(data.totalCents), { alwaysCents: true })}
            </span>
          </div>

          {formError ? (
            <p role="alert" className="mono-sm mb-4 border border-[#9c3b2b]/35 px-3 py-2.5 text-[#9c3b2b]">
              {formError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting || loading}
            className="flex h-[3.5rem] w-full items-center justify-between bg-ink px-6 text-[0.9375rem] font-medium text-paper transition-colors hover:bg-body disabled:opacity-40"
          >
            {submitting ? 'Starting PayNow…' : 'Pay with PayNow'}
            <span className="figure">
              {formatSgd(cents(data.totalCents), { alwaysCents: true })}
            </span>
          </button>

          <p className="mt-4 text-[0.75rem] leading-relaxed text-muted">
            PayNow only. You will be shown a QR code to scan in your banking app. Your order is
            confirmed the moment the payment clears — no card details are ever entered or stored.
          </p>

          <p className="mt-4">
            <Link href="/shop" className="mono text-faint underline underline-offset-4 hover:text-ink">
              Continue shopping
            </Link>
          </p>
        </aside>
      </form>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-[0.9375rem] text-body">{label}</span>
      <span className="figure text-[0.9375rem] text-ink">{value}</span>
    </div>
  )
}
