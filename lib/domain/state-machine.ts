import type { OrderStatus } from '@/lib/generated/prisma'

/**
 * Blueprint §19.2 — the order state machine.
 *
 * Every legal transition is enumerated here. An attempt to make one that is
 * not on this list THROWS at the domain layer, regardless of which route
 * handler, job or admin action requested it. The UI hides impossible actions
 * as a courtesy; the domain refuses them as a rule.
 */

export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['PAID', 'CANCELLED', 'REVIEW'],
  PAID: ['PROCESSING', 'READY_FOR_DELIVERY', 'CANCELLED', 'REFUNDED', 'REVIEW'],
  PROCESSING: ['READY_FOR_DELIVERY', 'DELIVERY_BOOKED', 'CANCELLED', 'REFUNDED', 'REVIEW'],
  READY_FOR_DELIVERY: ['DELIVERY_BOOKED', 'PROCESSING', 'CANCELLED', 'REFUNDED', 'REVIEW'],
  DELIVERY_BOOKED: ['OUT_FOR_DELIVERY', 'READY_FOR_DELIVERY', 'CANCELLED', 'REFUNDED', 'REVIEW'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'READY_FOR_DELIVERY', 'REVIEW'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
  // REVIEW is the "a human must look at this" state (§6.8 amount mismatch).
  REVIEW: ['PAID', 'PROCESSING', 'READY_FOR_DELIVERY', 'CANCELLED', 'REFUNDED'],
}

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
  ) {
    super(`Illegal order transition: ${from} → ${to}`)
    this.name = 'IllegalTransitionError'
  }
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to)
}

export const TERMINAL_STATUSES: OrderStatus[] = ['CANCELLED', 'REFUNDED']

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

/** Statuses at which the goods have been paid for and are ours to ship. */
export const FULFILLABLE_STATUSES: OrderStatus[] = [
  'PAID',
  'PROCESSING',
  'READY_FOR_DELIVERY',
]

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Pending payment',
  PAID: 'Paid',
  PROCESSING: 'Processing',
  READY_FOR_DELIVERY: 'Ready for delivery',
  DELIVERY_BOOKED: 'Delivery booked',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
  REVIEW: 'Needs review',
}
