import { formatSgd, cents } from '@/lib/money'

/**
 * The delivery rule, rendered from settings — never from hard-coded text.
 * Changing the threshold in the admin panel changes every surface that uses
 * this component (§4.5, milestone A4).
 */
export function DeliveryBanner({
  deliveryFeeCents,
  freeDeliveryThresholdCents,
}: {
  deliveryFeeCents: number
  freeDeliveryThresholdCents: number
}) {
  return (
    <section className="bg-ink text-white">
      <div className="wrap flex flex-col items-center gap-2 py-6 text-center md:flex-row md:justify-center md:gap-6 md:py-5">
        <p className="text-lg font-bold tracking-tight md:text-xl">
          FREE DELIVERY ON ORDERS {formatSgd(cents(freeDeliveryThresholdCents))}+
        </p>
        <p className="text-sm text-white/70">
          Below {formatSgd(cents(freeDeliveryThresholdCents))} — flat{' '}
          {formatSgd(cents(deliveryFeeCents))} delivery. Delivery only, no self-collection.
        </p>
      </div>
    </section>
  )
}

export function DeliveryNote({
  deliveryFeeCents,
  freeDeliveryThresholdCents,
}: {
  deliveryFeeCents: number
  freeDeliveryThresholdCents: number
}) {
  return (
    <p className="text-sm leading-relaxed text-muted">
      Delivered across Singapore. Orders {formatSgd(cents(freeDeliveryThresholdCents))} and above
      ship free; below that a flat {formatSgd(cents(deliveryFeeCents))} delivery fee applies. No
      self-collection.
    </p>
  )
}
