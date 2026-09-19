import 'server-only'
import { prisma } from '@/lib/db/client'
import { refundPayment } from '@/lib/payments/hitpay'
import { transitionOrder, recordOrderEvent } from '@/lib/domain/orders'
import { cents } from '@/lib/money'
import { logger } from '@/lib/observability/logger'

/**
 * Blueprint §6.9 — refunds.
 *
 * WHIPLY references the HitPay payment id and nothing else; it never touches
 * card data in a refund any more than in a payment (GUARD-4).
 *
 * Stock restoration is a SEPARATE, recorded decision: goods already delivered
 * are with the customer, so restoring stock is the operator's call and the
 * reason is written into the audit trail (§19.5).
 */
export type RefundOutcome =
  | { ok: true; refundId: string }
  | { ok: false; reason: string }

export async function refundOrder(input: {
  orderId: string
  actor: string
  restoreStock: boolean
  reason: string
}): Promise<RefundOutcome> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { payment: true, items: true },
  })

  if (!order) return { ok: false, reason: 'Order not found.' }
  if (!order.payment || order.payment.paymentStatus !== 'PAID') {
    return { ok: false, reason: 'This order has no completed payment to refund.' }
  }
  if (!order.payment.paymentId) {
    return { ok: false, reason: 'No provider payment id recorded — refund in the HitPay dashboard.' }
  }

  let refundId: string
  try {
    const result = await refundPayment({
      paymentId: order.payment.paymentId,
      amount: cents(order.totalCents),
    })
    refundId = result.refundId
  } catch (error) {
    logger.error('refund.provider_failed', {
      reference: order.reference,
      message: error instanceof Error ? error.message : 'unknown',
    })
    return {
      ok: false,
      reason: 'The payment provider refused the refund. Check the HitPay dashboard.',
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { orderId: order.id },
      data: {
        paymentStatus: 'REFUNDED',
        refundedAt: new Date(),
        refundedCents: order.totalCents,
      },
    })

    if (input.restoreStock) {
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: { increment: item.quantity } },
        })
      }
      await recordOrderEvent(tx, {
        orderId: order.id,
        type: 'STOCK_RESTORED',
        actor: input.actor,
        detail: {
          reason: input.reason,
          items: order.items.map((i) => ({ sku: i.skuAtPurchase, quantity: i.quantity })),
        },
      })
    }

    await transitionOrder(tx, {
      orderId: order.id,
      from: order.orderStatus,
      to: 'REFUNDED',
      actor: input.actor,
      type: 'REFUNDED',
      detail: { refundId, restoreStock: input.restoreStock, reason: input.reason },
    })
  })

  logger.info('refund.completed', {
    reference: order.reference,
    refundId,
    restoreStock: input.restoreStock,
  })

  return { ok: true, refundId }
}

/**
 * §9.2 — cancel a paid order that has not shipped, restoring stock. Separate
 * from a refund because cancelling and refunding are two decisions.
 */
export async function cancelOrder(input: {
  orderId: string
  actor: string
  reason: string
}): Promise<{ ok: boolean; reason?: string }> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { items: true, delivery: true },
  })

  if (!order) return { ok: false, reason: 'Order not found.' }
  if (order.delivery?.providerRef) {
    return {
      ok: false,
      reason: 'Cancel the courier booking first — the goods may already be moving.',
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (order.orderStatus !== 'PENDING_PAYMENT') {
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stockQty: { increment: item.quantity } },
          })
        }
        await recordOrderEvent(tx, {
          orderId: order.id,
          type: 'STOCK_RESTORED',
          actor: input.actor,
          detail: { reason: input.reason },
        })
      }

      await transitionOrder(tx, {
        orderId: order.id,
        from: order.orderStatus,
        to: 'CANCELLED',
        actor: input.actor,
        type: 'CANCELLED',
        detail: { reason: input.reason },
        extra: { cancelledAt: new Date() },
      })
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Could not cancel.' }
  }
}
