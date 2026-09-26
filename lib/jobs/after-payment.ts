import 'server-only'
import { prisma, type Prisma } from '@/lib/db/client'
import { openFulfilment } from '@/lib/domain/fulfilment'
import { sendReceiptEmail } from '@/lib/notify/receipt-email'
import { sendBusinessOrderAlert } from '@/lib/notify/whatsapp'
import type { NotifiableOrder } from '@/lib/notify/order-summary'
import { logger } from '@/lib/observability/logger'

/**
 * Blueprint §6.5 — EVERYTHING THAT HAPPENS AFTER PAYMENT IS TRUE.
 *
 * Called by the Stripe webhook once settlement has committed, and by the
 * reconciliation cron for anything the webhook never reached. Both go through
 * this one function, so a lost webhook produces a LATE order rather than a
 * different one.
 *
 * Three properties hold here and each one is load-bearing:
 *
 *  1. NOTHING here can fail the webhook. The money is already banked and the
 *     order is already PAID; a WhatsApp outage must not make Stripe retry a
 *     settlement that has committed. Every step is caught.
 *
 *  2. Each notification is ONE-SHOT, enforced by a timestamp column rather
 *     than by "we only call this once". `receipt_sent_at` and `notified_at`
 *     are written after a confirmed send, so a replayed webhook, a cron
 *     sweep and a manual re-run all converge on exactly one email and one
 *     WhatsApp message.
 *
 *  3. A step that fails leaves its stamp NULL, which is precisely the query
 *     the sweep runs. Failure is therefore self-healing and needs no queue.
 */

const ORDER_INCLUDE = {
  items: true,
  payment: true,
  discountCode: { select: { code: true } },
} as const

export type AfterPaymentResult = {
  fulfilmentOpened: boolean
  receipt: 'SENT' | 'ALREADY_SENT' | 'FAILED' | 'NO_PAYMENT'
  whatsapp: 'SENT' | 'ALREADY_SENT' | 'FAILED' | 'NO_PAYMENT'
}

export async function runAfterPayment(orderId: string): Promise<AfterPaymentResult> {
  const result: AfterPaymentResult = {
    fulfilmentOpened: false,
    receipt: 'FAILED',
    whatsapp: 'FAILED',
  }

  try {
    await openFulfilment(orderId)
    result.fulfilmentOpened = true
  } catch (error) {
    logger.error('after_payment.fulfilment_failed', {
      orderId,
      message: error instanceof Error ? error.message : 'unknown',
    })
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: ORDER_INCLUDE,
  })

  if (!order || !order.payment) {
    return { ...result, receipt: 'NO_PAYMENT', whatsapp: 'NO_PAYMENT' }
  }

  const notifiable = toNotifiable(order)

  // ── Customer receipt ──────────────────────────────────────────────
  if (order.payment.receiptSentAt) {
    result.receipt = 'ALREADY_SENT'
  } else {
    try {
      const sent = await sendReceiptEmail(notifiable)
      if (sent.sent) {
        await prisma.payment.update({
          where: { orderId: order.id },
          data: { receiptSentAt: new Date() },
        })
        result.receipt = 'SENT'
      }
    } catch (error) {
      logger.error('after_payment.receipt_threw', {
        reference: order.reference,
        message: error instanceof Error ? error.message : 'unknown',
      })
    }
  }

  // ── Business WhatsApp alert ───────────────────────────────────────
  if (order.payment.notifiedAt) {
    result.whatsapp = 'ALREADY_SENT'
  } else {
    try {
      const sent = await sendBusinessOrderAlert(notifiable)
      if (sent.sent) {
        await prisma.payment.update({
          where: { orderId: order.id },
          data: { notifiedAt: new Date() },
        })
        result.whatsapp = 'SENT'
      }
    } catch (error) {
      logger.error('after_payment.whatsapp_threw', {
        reference: order.reference,
        message: error instanceof Error ? error.message : 'unknown',
      })
    }
  }

  logger.info('after_payment.done', { reference: order.reference, ...result })
  return result
}

/**
 * The sweep (§11.4). Anything paid in the last week whose receipt or alert
 * has no stamp is retried. A week rather than forever: past that, a missing
 * notification is a support question, not a job to keep running.
 */
export async function sweepPendingNotifications(limit = 25): Promise<{
  considered: number
  results: AfterPaymentResult[]
}> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60_000)

  const due = await prisma.payment.findMany({
    where: {
      paymentStatus: 'PAID',
      paidAt: { gte: since },
      OR: [{ receiptSentAt: null }, { notifiedAt: null }],
    },
    select: { orderId: true },
    orderBy: { paidAt: 'asc' },
    take: limit,
  })

  const results: AfterPaymentResult[] = []
  for (const row of due) {
    try {
      results.push(await runAfterPayment(row.orderId))
    } catch (error) {
      logger.error('after_payment.sweep_failed', {
        orderId: row.orderId,
        message: error instanceof Error ? error.message : 'unknown',
      })
    }
  }

  return { considered: due.length, results }
}

type OrderWithIncludes = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>

export function toNotifiable(order: OrderWithIncludes): NotifiableOrder {
  return {
    reference: order.reference,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    deliveryFeeCents: order.deliveryFeeCents,
    totalCents: order.totalCents,
    deliveryMethod: order.deliveryMethod,
    deliverySlotStart: order.deliverySlotStart,
    deliverySlotEnd: order.deliverySlotEnd,
    contactName: order.contactName,
    contactEmail: order.contactEmail,
    contactPhone: order.contactPhone,
    addressLine1: order.addressLine1,
    addressLine2: order.addressLine2,
    postalCode: order.postalCode,
    instructions: order.instructions,
    discountCode: order.discountCode ? { code: order.discountCode.code } : null,
    items: order.items.map((item) => ({
      nameAtPurchase: item.nameAtPurchase,
      skuAtPurchase: item.skuAtPurchase,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents,
    })),
  }
}
