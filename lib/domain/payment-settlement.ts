import 'server-only'
import { createHash } from 'node:crypto'
import { prisma, type Prisma } from '@/lib/db/client'
import { transitionOrder, recordOrderEvent } from './orders'
import { countRedemption } from './redemptions'
import { logger } from '@/lib/observability/logger'

/**
 * Blueprint §6.4 steps 3–8 — THE TRANSACTION.
 *
 * This is the highest-value function in the system. It is called by the
 * webhook handler AND by the reconciliation job, through the same code path,
 * so a missed webhook produces a delayed order rather than a different one.
 */

export type SettlementOutcome =
  | { kind: 'ALREADY_PROCESSED' }
  | { kind: 'ORDER_NOT_FOUND' }
  | { kind: 'AMOUNT_MISMATCH'; expectedCents: number; paidCents: number }
  | { kind: 'ALREADY_PAID' }
  | { kind: 'NOT_PAYABLE'; status: string }
  | { kind: 'PAID'; orderId: string; reference: string; oversold: string[] }

export function digestPayload(raw: string): string {
  return createHash('sha256').update(raw).digest('hex').slice(0, 32)
}

/**
 * Step 3 — idempotency, enforced by a UNIQUE INDEX rather than a
 * check-then-act read. Returns false when this event has been seen before.
 */
export async function claimWebhookEvent(input: {
  provider: string
  eventId: string
  rawBody: string
}): Promise<boolean> {
  try {
    await prisma.webhookEvent.create({
      data: {
        provider: input.provider,
        eventId: input.eventId,
        payloadDigest: digestPayload(input.rawBody),
      },
    })
    return true
  } catch (error) {
    // P2002 = unique constraint violation = we have already processed this.
    if (isUniqueViolation(error)) return false
    throw error
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  )
}

export async function settlePaidPayment(input: {
  reference: string
  paidAmountCents: number
  providerPaymentId: string | null
  method: string | null
  actor: string
}): Promise<SettlementOutcome> {
  const order = await prisma.order.findUnique({
    where: { reference: input.reference },
    include: { items: true, payment: true },
  })

  // Step 5 — an unknown reference is loud, but must not make the provider
  // retry forever (§12.4 rule 2).
  if (!order) return { kind: 'ORDER_NOT_FOUND' }

  if (order.orderStatus !== 'PENDING_PAYMENT') {
    if (order.payment?.paymentStatus === 'PAID') return { kind: 'ALREADY_PAID' }
    return { kind: 'NOT_PAYABLE', status: order.orderStatus }
  }

  // Step 6 — the amount assertion. An order whose paid amount does not match
  // its recorded total is either a pricing bug or an attempt to pay a
  // different amount. Neither silently ships goods.
  if (input.paidAmountCents !== order.totalCents) {
    await prisma.$transaction(async (tx) => {
      await transitionOrder(tx, {
        orderId: order.id,
        from: 'PENDING_PAYMENT',
        to: 'REVIEW',
        actor: input.actor,
        type: 'AMOUNT_MISMATCH',
        detail: { expectedCents: order.totalCents, paidCents: input.paidAmountCents },
        extra: {
          reviewReason: `Paid ${input.paidAmountCents} but order total is ${order.totalCents}`,
        },
      })
    })
    logger.critical('payment.amount_mismatch', {
      reference: order.reference,
      expectedCents: order.totalCents,
      paidCents: input.paidAmountCents,
    })
    return {
      kind: 'AMOUNT_MISMATCH',
      expectedCents: order.totalCents,
      paidCents: input.paidAmountCents,
    }
  }

  // Step 7 — ONE TRANSACTION: payment paid, order paid, stock deducted,
  // code counted. Two writes that must both happen or neither.
  const oversold: string[] = []

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { orderId: order.id },
      data: {
        paymentStatus: 'PAID',
        paidAt: new Date(),
        paymentId: input.providerPaymentId,
        method: input.method,
      },
    })

    await transitionOrder(tx, {
      orderId: order.id,
      from: 'PENDING_PAYMENT',
      to: 'PAID',
      actor: input.actor,
      type: 'PAID',
      detail: { paidCents: input.paidAmountCents, method: input.method },
      extra: { paidAt: new Date() },
    })

    for (const item of order.items) {
      // Conditional decrement: the WHERE clause is the oversell guard, and
      // the CHECK constraint behind it is the last line of defence.
      const changed = await tx.product.updateMany({
        where: { id: item.productId, stockQty: { gte: item.quantity } },
        data: { stockQty: { decrement: item.quantity } },
      })

      if (changed.count === 0) {
        // The customer has paid. We owe them goods or a refund, and hiding
        // that would be worse than surfacing it (§6.8).
        oversold.push(item.skuAtPurchase)
        await recordOrderEvent(tx, {
          orderId: order.id,
          type: 'OVERSOLD',
          actor: 'system',
          detail: { sku: item.skuAtPurchase, quantity: item.quantity },
        })
      }
    }

    if (order.discountCodeId) {
      const outcome = await countRedemption(tx, {
        codeId: order.discountCodeId,
        orderId: order.id,
        discountCents: order.discountCents,
        orderTotalCents: order.totalCents,
      })
      if (!outcome.counted) {
        await recordOrderEvent(tx, {
          orderId: order.id,
          type: 'CODE_OVER_REDEEMED',
          actor: 'system',
          detail: { codeId: order.discountCodeId },
        })
      }
    }
  })

  if (oversold.length > 0) {
    logger.critical('stock.oversold', { reference: order.reference, skus: oversold })
  }

  logger.info('payment.settled', {
    reference: order.reference,
    totalCents: order.totalCents,
    method: input.method,
  })

  return { kind: 'PAID', orderId: order.id, reference: order.reference, oversold }
}

export async function markPaymentFailed(input: {
  reference: string
  status: 'FAILED' | 'EXPIRED'
  actor: string
}): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { reference: input.reference },
    include: { payment: true },
  })
  if (!order || order.orderStatus !== 'PENDING_PAYMENT') return

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.payment.updateMany({
      where: { orderId: order.id },
      data: { paymentStatus: input.status },
    })
    await transitionOrder(tx, {
      orderId: order.id,
      from: 'PENDING_PAYMENT',
      to: 'CANCELLED',
      actor: input.actor,
      type: input.status,
      extra: { cancelledAt: new Date() },
    })
  })
}
