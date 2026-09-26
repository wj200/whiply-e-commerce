import 'server-only'
import { prisma } from '@/lib/db/client'

/**
 * Blueprint §7.5 / §9.5 / D6 — delivery margin.
 *
 * The customer pays a business rule; WHIPLY pays for the run. Both numbers
 * are recorded per order, and this is where they are put side by side —
 * which is what turns "is free delivery above S$200 actually working for
 * us?" from a feeling into a number the operator can act on by changing one
 * setting.
 *
 * With fulfilment self-managed there is no quotation to compare against, so
 * the cost side is whatever the operator entered on the delivery: fuel, a
 * hired van, a third-party run booked by hand. A delivery with no cost
 * recorded counts as zero and is reported separately, because a margin that
 * silently assumes free labour is worse than no margin at all.
 */

export type DeliveryCostSummary = {
  deliveries: number
  feesCollectedCents: number
  actualCostCents: number
  /** Positive = delivery made money; negative = it was subsidised. */
  marginCents: number
  /** Deliveries with no cost entered — the margin above understates by these. */
  uncostedCount: number
  freeDeliveryCount: number
  freeDeliveryCostCents: number
}

export async function deliveryCostSummary(range?: {
  from?: Date
  to?: Date
}): Promise<DeliveryCostSummary> {
  const deliveries = await prisma.delivery.findMany({
    where: {
      ...(range?.from || range?.to
        ? {
            createdAt: {
              ...(range.from ? { gte: range.from } : {}),
              ...(range.to ? { lte: range.to } : {}),
            },
          }
        : {}),
      // Only runs that actually happened. A scheduled-but-not-yet-dispatched
      // delivery has no cost to report and would dilute the margin.
      deliveryStatus: { in: ['OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED'] },
    },
    select: {
      actualCostCents: true,
      order: { select: { deliveryFeeCents: true } },
    },
  })

  const summary: DeliveryCostSummary = {
    deliveries: deliveries.length,
    feesCollectedCents: 0,
    actualCostCents: 0,
    marginCents: 0,
    uncostedCount: 0,
    freeDeliveryCount: 0,
    freeDeliveryCostCents: 0,
  }

  for (const d of deliveries) {
    const fee = d.order.deliveryFeeCents
    const actual = d.actualCostCents ?? 0
    if (d.actualCostCents === null) summary.uncostedCount += 1

    summary.feesCollectedCents += fee
    summary.actualCostCents += actual

    if (fee === 0) {
      summary.freeDeliveryCount += 1
      summary.freeDeliveryCostCents += actual
    }
  }

  summary.marginCents = summary.feesCollectedCents - summary.actualCostCents
  return summary
}

export type DeliveryRow = {
  orderId: string
  reference: string
  deliveryStatus: string
  orderStatus: string
  deliveryMethod: string
  slotStart: Date | null
  slotEnd: Date | null
  customerName: string
  postalCode: string
  feeChargedCents: number
  actualCostCents: number | null
  courierRef: string | null
  notes: string | null
  dispatchedAt: Date | null
  deliveredAt: Date | null
  createdAt: Date
}

export async function listDeliveries(opts: {
  status?: string
  from?: Date
  to?: Date
  limit?: number
}): Promise<DeliveryRow[]> {
  const rows = await prisma.delivery.findMany({
    where: {
      ...(opts.status ? { deliveryStatus: opts.status as never } : {}),
      ...(opts.from || opts.to
        ? {
            createdAt: {
              ...(opts.from ? { gte: opts.from } : {}),
              ...(opts.to ? { lte: opts.to } : {}),
            },
          }
        : {}),
    },
    include: { order: true },
    // The run sheet is read in the order the van drives it, so a booked slot
    // sorts ahead of creation time.
    orderBy: [{ order: { deliverySlotStart: 'asc' } }, { createdAt: 'desc' }],
    take: opts.limit ?? 200,
  })

  return rows.map((d) => ({
    orderId: d.orderId,
    reference: d.order.reference,
    deliveryStatus: d.deliveryStatus,
    orderStatus: d.order.orderStatus,
    deliveryMethod: d.order.deliveryMethod,
    slotStart: d.order.deliverySlotStart,
    slotEnd: d.order.deliverySlotEnd,
    customerName: d.order.contactName,
    postalCode: d.order.postalCode,
    feeChargedCents: d.order.deliveryFeeCents,
    actualCostCents: d.actualCostCents,
    courierRef: d.courierRef,
    notes: d.notes,
    dispatchedAt: d.dispatchedAt,
    deliveredAt: d.deliveredAt,
    createdAt: d.createdAt,
  }))
}

/** §9.5 — CSV export of exactly the rows shown. */
export function deliveriesToCsv(rows: DeliveryRow[]): string {
  const header = [
    'reference',
    'order_status',
    'delivery_status',
    'method',
    'slot_start',
    'slot_end',
    'customer',
    'postal_code',
    'fee_charged_sgd',
    'actual_cost_sgd',
    'margin_sgd',
    'courier_ref',
    'dispatched_at',
    'delivered_at',
  ]

  const body = rows.map((r) => {
    const actual = r.actualCostCents ?? 0
    return [
      r.reference,
      r.orderStatus,
      r.deliveryStatus,
      r.deliveryMethod,
      r.slotStart?.toISOString() ?? '',
      r.slotEnd?.toISOString() ?? '',
      r.customerName,
      r.postalCode,
      money(r.feeChargedCents),
      money(r.actualCostCents),
      money(r.feeChargedCents - actual),
      r.courierRef ?? '',
      r.dispatchedAt?.toISOString() ?? '',
      r.deliveredAt?.toISOString() ?? '',
    ]
      .map(csvCell)
      .join(',')
  })

  return [header.join(','), ...body].join('\n')
}

function money(cents: number | null): string {
  if (cents === null) return ''
  return (cents / 100).toFixed(2)
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}
