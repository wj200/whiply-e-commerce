import { formatSgd, cents } from '@/lib/money'
import { formatSlotWithDate } from '@/lib/domain/delivery-slots'

/**
 * Blueprint §8.5 — the ONE description of an order that both notifications
 * are rendered from.
 *
 * The receipt the customer reads and the alert the business reads must never
 * disagree about what was bought, so they are built from the same struct by
 * the same formatters. Money goes through `formatSgd`; nothing here does
 * arithmetic.
 */

export type NotifiableOrder = {
  reference: string
  createdAt: Date
  paidAt: Date | null
  subtotalCents: number
  discountCents: number
  deliveryFeeCents: number
  totalCents: number
  deliveryMethod: 'STANDARD' | 'EXPRESS'
  deliverySlotStart: Date | null
  deliverySlotEnd: Date | null
  contactName: string
  contactEmail: string
  contactPhone: string
  addressLine1: string
  addressLine2: string | null
  postalCode: string
  instructions: string | null
  discountCode: { code: string } | null
  items: {
    nameAtPurchase: string
    skuAtPurchase: string
    quantity: number
    unitPriceCents: number
    lineTotalCents: number
  }[]
}

export function methodLabel(method: 'STANDARD' | 'EXPRESS'): string {
  return method === 'EXPRESS' ? 'Express (within 2 hours)' : 'Standard (2–3 working days)'
}

export function slotLabel(order: NotifiableOrder): string {
  if (!order.deliverySlotStart || !order.deliverySlotEnd) return 'To be arranged'
  return formatSlotWithDate({ start: order.deliverySlotStart, end: order.deliverySlotEnd })
}

export function addressLines(order: NotifiableOrder): string[] {
  return [order.addressLine1, order.addressLine2 ?? '', `Singapore ${order.postalCode}`].filter(
    (line) => line.trim().length > 0,
  )
}

/** "2 × 640g N₂O — 6 tank pack, 1 × Industrial mixer" */
export function itemSummary(order: NotifiableOrder, max = 4): string {
  const parts = order.items
    .slice(0, max)
    .map((item) => `${item.quantity} × ${item.nameAtPurchase}`)
  const rest = order.items.length - parts.length
  if (rest > 0) parts.push(`+${rest} more`)
  return parts.join(', ')
}

/** The money block, in the order every receipt in the world shows it. */
export function totalsRows(order: NotifiableOrder): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [
    { label: 'Subtotal', value: formatSgd(cents(order.subtotalCents), { alwaysCents: true }) },
  ]
  if (order.discountCents > 0) {
    rows.push({
      label: order.discountCode ? `Discount (${order.discountCode.code})` : 'Discount',
      value: `−${formatSgd(cents(order.discountCents), { alwaysCents: true })}`,
    })
  }
  rows.push({
    label: order.deliveryFeeCents === 0 ? 'Delivery (free)' : 'Delivery',
    value: formatSgd(cents(order.deliveryFeeCents), { alwaysCents: true }),
  })
  rows.push({ label: 'Total paid', value: formatSgd(cents(order.totalCents), { alwaysCents: true }) })
  return rows
}
