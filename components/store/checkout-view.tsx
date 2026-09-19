'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useCart } from '@/lib/cart/context'
import { usePricedCart } from '@/lib/cart/use-priced-cart'
import { formatSgd, cents } from '@/lib/money'
import { OrderSummary } from './order-summary'
import { PromoCodeField } from './promo-code-field'
import { Button, ButtonLink } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'

type FieldErrors = Partial<Record<string, string>>

export function CheckoutView() {
  const { cart } = useCart()
  const [code, setCode] = useState<string | null>(null)
  const { data, loading, isEmpty, hydrated } = usePricedCart(code)

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

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
    setFormError(null)
    setErrors({})

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: cart.lines,
          contact,
          code,
          idempotencyKey: crypto.randomUUID(),
        }),
      })

      const body = (await res.json()) as {
        checkoutUrl?: string
        error?: string
        issues?: { path: string; message: string }[]
      }

      if (!res.ok) {
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
        // Leave for HitPay. From here the browser is irrelevant: the order is
        // confirmed by the signed webhook, not by the customer coming back.
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
      <div className="wrap py-20">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  if (isEmpty || !data || data.lines.length === 0) {
    return (
      <div className="wrap py-20 text-center">
        <h1 className="font-display text-3xl font-bold text-ink">Nothing to check out</h1>
        <p className="mt-3 text-muted">Your cart is empty.</p>
        <ButtonLink href="/shop" className="mt-7">
          Browse the shop
        </ButtonLink>
      </div>
    )
  }

  return (
    <div className="wrap py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">
        Checkout
      </h1>
      <p className="mt-2 text-muted">
        Delivered across Singapore. No account needed —{' '}
        <strong className="font-semibold text-ink">keep your order reference</strong> after payment.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem] lg:gap-12">
        <div className="space-y-8">
          <section>
            <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted">
              Your details
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="name" label="Full name" required error={errors.name} className="sm:col-span-2">
                <Input id="name" name="name" autoComplete="name" required aria-invalid={!!errors.name} />
              </Field>
              <Field id="email" label="Email" required error={errors.email} hint="Your receipt is sent here.">
                <Input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  aria-invalid={!!errors.email}
                />
              </Field>
              <Field id="phone" label="Mobile number" required error={errors.phone} hint="For the courier.">
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="9123 4567"
                  required
                  aria-invalid={!!errors.phone}
                />
              </Field>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted">
              Delivery address
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="addressLine1"
                label="Address"
                required
                error={errors.addressLine1}
                className="sm:col-span-2"
              >
                <Input
                  id="addressLine1"
                  name="addressLine1"
                  autoComplete="address-line1"
                  required
                  aria-invalid={!!errors.addressLine1}
                />
              </Field>
              <Field id="addressLine2" label="Unit / floor" error={errors.addressLine2}>
                <Input id="addressLine2" name="addressLine2" autoComplete="address-line2" placeholder="#04-05" />
              </Field>
              <Field id="postalCode" label="Postal code" required error={errors.postalCode}>
                <Input
                  id="postalCode"
                  name="postalCode"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={6}
                  placeholder="123456"
                  required
                  aria-invalid={!!errors.postalCode}
                />
              </Field>
              <Field
                id="instructions"
                label="Delivery instructions"
                error={errors.instructions}
                className="sm:col-span-2"
              >
                <Textarea id="instructions" name="instructions" maxLength={280} rows={3} />
              </Field>
            </div>
            <p className="mt-3 rounded-[var(--radius-control)] bg-shell px-4 py-3 text-sm text-muted">
              We deliver to your address. There is no self-collection option.
            </p>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[var(--radius-card)] border border-line bg-shell p-5">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted">
              Order summary
            </h2>

            <ul className="mb-4 space-y-2 border-b border-line pb-4">
              {data.lines.map((line) => (
                <li key={line.sku} className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0 text-body">
                    <span className="font-semibold text-ink">{line.quantity}×</span> {line.name}
                  </span>
                  <span className="shrink-0 font-semibold text-ink tnum">
                    {formatSgd(cents(line.lineTotalCents), { alwaysCents: true })}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mb-5">
              <PromoCodeField
                appliedCode={data.appliedCode?.code ?? null}
                codeError={data.codeError}
                onApply={setCode}
                onRemove={() => setCode(null)}
                disabled={loading || submitting}
              />
            </div>

            <OrderSummary
              subtotalCents={data.subtotalCents}
              discountCents={data.discountCents}
              deliveryFeeCents={data.deliveryFeeCents}
              totalCents={data.totalCents}
              freeDeliveryApplied={data.freeDeliveryApplied}
              amountToFreeDeliveryCents={data.amountToFreeDeliveryCents}
              appliedCodeLabel={data.appliedCode?.code ?? null}
            />

            {formError ? (
              <p role="alert" className="mt-4 rounded-[var(--radius-control)] bg-danger-soft px-3 py-2.5 text-sm text-danger">
                {formError}
              </p>
            ) : null}

            <Button type="submit" size="lg" className="mt-5 w-full" disabled={submitting || loading}>
              {submitting ? 'Starting payment…' : 'Pay Now'}
            </Button>

            <p className="mt-3 text-center text-xs leading-relaxed text-muted">
              You will be taken to our payment provider to pay securely. WHIPLY never sees your
              card details.
            </p>

            <p className="mt-3 text-center text-xs text-muted">
              <Link href="/cart" className="underline underline-offset-2 hover:no-underline">
                Back to cart
              </Link>
            </p>
          </div>
        </aside>
      </form>
    </div>
  )
}
