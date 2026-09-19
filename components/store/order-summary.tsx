import { formatSgd, cents } from '@/lib/money'

export function OrderSummary({
  subtotalCents,
  discountCents,
  deliveryFeeCents,
  totalCents,
  freeDeliveryApplied,
  amountToFreeDeliveryCents,
  appliedCodeLabel,
}: {
  subtotalCents: number
  discountCents: number
  deliveryFeeCents: number
  totalCents: number
  freeDeliveryApplied: boolean
  amountToFreeDeliveryCents: number
  appliedCodeLabel?: string | null
}) {
  return (
    <div className="space-y-2.5">
      <Row label="Subtotal" value={formatSgd(cents(subtotalCents), { alwaysCents: true })} />

      {discountCents > 0 ? (
        <Row
          label={appliedCodeLabel ? `Discount (${appliedCodeLabel})` : 'Discount'}
          value={`−${formatSgd(cents(discountCents), { alwaysCents: true })}`}
          tone="success"
        />
      ) : null}

      <Row
        label="Delivery"
        value={
          freeDeliveryApplied ? 'FREE' : formatSgd(cents(deliveryFeeCents), { alwaysCents: true })
        }
        tone={freeDeliveryApplied ? 'success' : undefined}
      />

      {!freeDeliveryApplied && amountToFreeDeliveryCents > 0 ? (
        <p className="rounded-[var(--radius-control)] bg-accent-soft px-3 py-2 text-xs leading-relaxed text-accent">
          Add {formatSgd(cents(amountToFreeDeliveryCents), { alwaysCents: true })} more for free
          delivery.
        </p>
      ) : null}

      <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
        <span className="text-base font-bold text-ink">Total</span>
        <span className="text-xl font-bold text-ink tnum">
          {formatSgd(cents(totalCents), { alwaysCents: true })}
        </span>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'success'
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted">{label}</span>
      <span className={`font-semibold tnum ${tone === 'success' ? 'text-success' : 'text-ink'}`}>
        {value}
      </span>
    </div>
  )
}
