import 'server-only'
import { prisma } from '@/lib/db/client'
import type { OrderStatus } from '@/lib/generated/prisma'

/** Blueprint §9.2 — the orders screen the operator opens every morning. */

export const ORDER_TABS: { key: OrderStatus | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'PENDING_PAYMENT', label: 'Pending payment' },
  { key: 'PAID', label: 'Paid' },
  { key: 'PROCESSING', label: 'Processing' },
  { key: 'READY_FOR_DELIVERY', label: 'Ready for delivery' },
  { key: 'DELIVERY_BOOKED', label: 'Delivery booked' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { key: 'DELIVERED', label: 'Delivered' },
  { key: 'REVIEW', label: 'Needs review' },
  { key: 'CANCELLED', label: 'Cancelled' },
  { key: 'REFUNDED', label: 'Refunded' },
]

export async function orderCounts(): Promise<Record<string, number>> {
  const grouped = await prisma.order.groupBy({ by: ['orderStatus'], _count: { _all: true } })
  const counts: Record<string, number> = { ALL: 0 }
  for (const row of grouped) {
    counts[row.orderStatus] = row._count._all
    counts.ALL = (counts.ALL ?? 0) + row._count._all
  }
  return counts
}

export async function listOrders(opts: {
  status?: OrderStatus | 'ALL'
  q?: string
  limit?: number
}) {
  const q = opts.q?.trim()
  return prisma.order.findMany({
    where: {
      ...(opts.status && opts.status !== 'ALL' ? { orderStatus: opts.status } : {}),
      ...(q
        ? {
            OR: [
              { reference: { contains: q, mode: 'insensitive' as const } },
              { contactName: { contains: q, mode: 'insensitive' as const } },
              { normalisedEmail: { contains: q.toLowerCase() } },
              { normalisedPhone: { contains: q.replace(/\s/g, '') } },
            ],
          }
        : {}),
    },
    include: { payment: true, delivery: true, items: true },
    orderBy: { createdAt: 'desc' },
    take: opts.limit ?? 100,
  })
}

export async function getOrderDetail(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
      payment: true,
      delivery: true,
      discountCode: true,
      redemption: true,
      events: { orderBy: { createdAt: 'asc' } },
    },
  })
}

/**
 * §9.9 — "Customers" is a VIEW, not a table. There is no customer entity,
 * because there are no accounts. This groups orders by normalised email and
 * costs nothing to maintain, because it stores nothing.
 *
 * It is also not a mailing list, and there is no export that turns it into one.
 */
export type DerivedCustomer = {
  email: string
  phone: string
  name: string
  orderCount: number
  lifetimeValueCents: number
  lastOrderAt: Date
  codesUsed: string[]
}

export async function derivedCustomers(limit = 200): Promise<DerivedCustomer[]> {
  const orders = await prisma.order.findMany({
    where: { orderStatus: { notIn: ['PENDING_PAYMENT', 'CANCELLED'] } },
    include: { discountCode: { select: { code: true } } },
    orderBy: { createdAt: 'desc' },
  })

  const byEmail = new Map<string, DerivedCustomer>()

  for (const order of orders) {
    const key = order.normalisedEmail
    const existing = byEmail.get(key)
    if (existing) {
      existing.orderCount += 1
      existing.lifetimeValueCents += order.totalCents
      if (order.discountCode && !existing.codesUsed.includes(order.discountCode.code)) {
        existing.codesUsed.push(order.discountCode.code)
      }
    } else {
      byEmail.set(key, {
        email: order.contactEmail,
        phone: order.contactPhone,
        name: order.contactName,
        orderCount: 1,
        lifetimeValueCents: order.totalCents,
        lastOrderAt: order.createdAt,
        codesUsed: order.discountCode ? [order.discountCode.code] : [],
      })
    }
  }

  return [...byEmail.values()]
    .sort((a, b) => b.lifetimeValueCents - a.lifetimeValueCents)
    .slice(0, limit)
}
