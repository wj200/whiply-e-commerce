import 'server-only'
import { prisma } from '@/lib/db/client'

/**
 * Blueprint §7.5 / §9.5 / D6 — delivery margin.
 *
 * The customer pays a business rule; WHIPLY pays the courier. Both numbers
 * are recorded per order, and this is where they are put side by side —
 * which is what turns "is free delivery above S$200 actually working for
 * us?" from a feeling into a number the operator can act on by changing
 * one setting.
 */

export type DeliveryCostSummary = {
  deliveries: number
  feesCollectedCents: number
  estimatedCostCents: number
  actualCostCents: number
  /** Positive = delivery made money; negative = it was subsidised. */
  marginCents: number
  freeDeliveryCount: number
  freeDeliveryCostCents: number
}

export async function deliveryCostSummary(range?: {
  from?: Date
  to?: Date
}): Promise<DeliveryCostSummary> {
  const where = {
    ...(range?.from || range?.to
      ? { createdAt: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } }
      : {}),
    providerRef: { not: null },
  }

  const deliveries = await prisma.delivery.findMany({
    where,
    select: {
      estimatedCostCents: true,
      actualCostCents: true,
      order: { select: { deliveryFeeCents: true } },
    },
  })

  const summary: DeliveryCostSummary = {
    deliveries: deliveries.length,
    feesCollectedCents: 0,
    estimatedCostCents: 0,
    actualCostCents: 0,
    marginCents: 0,
    freeDeliveryCount: 0,
    freeDeliveryCostCents: 0,
  }

  for (const d of deliveries) {
    const fee = d.order.deliveryFeeCents
    const actual = d.actualCostCents ?? d.estimatedCostCents ?? 0

    summary.feesCollectedCents += fee
    summary.estimatedCostCents += d.estimatedCostCents ?? 0
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
  provider: string
  providerRef: string | null
  deliveryStatus: string
  orderStatus: string
  customerName: string
  postalCode: string
  feeChargedCents: number
  estimatedCostCents: number | null
  actualCostCents: number | null
  trackingUrl: string | null
  driverName: string | null
  bookedAt: Date | null
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
        ? { createdAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
        : {}),
    },
    include: { order: true },
    orderBy: { createdAt: 'desc' },
    take: opts.limit ?? 200,
  })

  return rows.map((d) => ({
    orderId: d.orderId,
    reference: d.order.reference,
    provider: d.provider,
    providerRef: d.providerRef,
    deliveryStatus: d.deliveryStatus,
    orderStatus: d.order.orderStatus,
    customerName: d.order.contactName,
    postalCode: d.order.postalCode,
    feeChargedCents: d.order.deliveryFeeCents,
    estimatedCostCents: d.estimatedCostCents,
    actualCostCents: d.actualCostCents,
    trackingUrl: d.trackingUrl,
    driverName: (d.driver as { name?: string } | null)?.name ?? null,
    bookedAt: d.bookedAt,
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
    'provider',
    'provider_ref',
    'customer',
    'postal_code',
    'fee_charged_sgd',
    'estimated_cost_sgd',
    'actual_cost_sgd',
    'margin_sgd',
    'booked_at',
    'delivered_at',
  ]

  const body = rows.map((r) => {
    const actual = r.actualCostCents ?? r.estimatedCostCents ?? 0
    return [
      r.reference,
      r.orderStatus,
      r.deliveryStatus,
      r.provider,
      r.providerRef ?? '',
      r.customerName,
      r.postalCode,
      money(r.feeChargedCents),
      money(r.estimatedCostCents),
      money(r.actualCostCents),
      money(r.feeChargedCents - actual),
      r.bookedAt?.toISOString() ?? '',
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
