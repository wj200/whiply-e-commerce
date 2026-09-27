import 'server-only'
import { prisma, type Prisma } from '@/lib/db/client'
import type { OrderStatus } from '@/lib/generated/prisma'
import { assertTransition } from './state-machine'
import { generateReference } from './reference'
import { priceBasket } from './basket'
import {
  normaliseEmail,
  normalisePhone,
  resolveContactName,
  type CheckoutContact,
} from './contact'
import type { DeliveryMethodName } from './delivery-slots'
import type { CartLine } from '@/lib/cart/types'
import { assertBasketInvariants } from './pricing'

export class CheckoutError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'EMPTY_BASKET'
      | 'STORE_CLOSED'
      | 'INVALID_CONTACT'
      | 'INVALID_SLOT',
  ) {
    super(message)
    this.name = 'CheckoutError'
  }
}

export type CreatedOrder = {
  id: string
  reference: string
  totalCents: number
  subtotalCents: number
  discountCents: number
  deliveryFeeCents: number
  deliveryMethod: DeliveryMethodName
  deliverySlotStart: Date
  deliverySlotEnd: Date
}

/**
 * Blueprint §6.2 — the ONLY way an order comes into existence.
 *
 * The basket is re-priced from the database here; whatever totals the client
 * believed are never read. Stock is deliberately NOT reserved: an unpaid order
 * holds nothing, because abandoned checkouts silently removing sellable stock
 * is a worse problem at this volume than the oversell risk reservation solves
 * (§6.2, revisit trigger in §19.5).
 */
export async function createPendingOrder(input: {
  lines: CartLine[]
  contact: CheckoutContact
  codeInput: string | null
  delivery: { method: DeliveryMethodName; start: Date; end: Date }
  now?: Date
}): Promise<{ order: CreatedOrder; codeError: string | null; issues: unknown[] }> {
  const phone = normalisePhone(input.contact.phone)
  if (!phone) throw new CheckoutError('Invalid mobile number', 'INVALID_CONTACT')

  const { basket, issues, codeError } = await priceBasket({
    lines: input.lines,
    codeInput: input.codeInput,
    deliveryMethod: input.delivery.method,
    now: input.now,
  })

  if (basket.lines.length === 0) {
    throw new CheckoutError('There is nothing left in your cart to buy.', 'EMPTY_BASKET')
  }

  assertBasketInvariants(basket)

  const reference = generateReference(input.now)
  const email = normaliseEmail(input.contact.email)

  const order = await prisma.order.create({
    data: {
      reference,
      orderStatus: 'PENDING_PAYMENT',
      subtotalCents: basket.subtotalCents,
      discountCents: basket.discountCents,
      deliveryFeeCents: basket.deliveryFeeCents,
      totalCents: basket.totalCents,
      deliveryMethod: input.delivery.method,
      deliverySlotStart: input.delivery.start,
      deliverySlotEnd: input.delivery.end,
      contactName: resolveContactName(input.contact),
      contactEmail: input.contact.email.trim(),
      contactPhone: phone,
      addressLine1: input.contact.addressLine1,
      addressLine2: input.contact.addressLine2 || null,
      postalCode: input.contact.postalCode,
      instructions: input.contact.instructions || null,
      normalisedEmail: email,
      normalisedPhone: phone,
      discountCodeId: basket.appliedCode?.id ?? null,
      items: {
        create: basket.lines.map((line) => ({
          productId: line.productId,
          skuAtPurchase: line.sku,
          nameAtPurchase: line.name,
          imageAtPurchase: line.imageUrl,
          unitPriceCents: line.unitPriceCents,
          quantity: line.quantity,
          lineTotalCents: line.lineTotalCents,
        })),
      },
      events: {
        create: {
          type: 'CREATED',
          toStatus: 'PENDING_PAYMENT',
          actor: 'system:checkout',
          detail: {
            itemCount: basket.lines.length,
            code: basket.appliedCode?.code ?? null,
            deliveryMethod: input.delivery.method,
            slotStart: input.delivery.start.toISOString(),
          },
        },
      },
    },
  })

  return {
    order: {
      id: order.id,
      reference: order.reference,
      totalCents: order.totalCents,
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      deliveryFeeCents: order.deliveryFeeCents,
      deliveryMethod: input.delivery.method,
      deliverySlotStart: input.delivery.start,
      deliverySlotEnd: input.delivery.end,
    },
    codeError,
    issues,
  }
}

/**
 * The single guarded path for every order status change. Nothing writes
 * `orderStatus` directly — the transition is asserted and an event is recorded
 * in the same statement, so the timeline can never disagree with the state.
 */
export async function transitionOrder(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string
    from: OrderStatus
    to: OrderStatus
    actor: string
    type?: string
    detail?: Prisma.InputJsonValue
    extra?: Prisma.OrderUpdateInput
  },
): Promise<void> {
  assertTransition(input.from, input.to)

  const updated = await tx.order.updateMany({
    where: { id: input.orderId, orderStatus: input.from },
    data: { orderStatus: input.to, ...(input.extra as object) },
  })

  // Lost the race with a concurrent transition. Whoever won recorded their
  // own event; re-applying ours would corrupt the timeline.
  if (updated.count === 0) {
    throw new Error(
      `Order ${input.orderId} was no longer in ${input.from} when transitioning to ${input.to}`,
    )
  }

  await tx.orderEvent.create({
    data: {
      orderId: input.orderId,
      type: input.type ?? input.to,
      fromStatus: input.from,
      toStatus: input.to,
      actor: input.actor,
      detail: input.detail ?? {},
    },
  })
}

export async function recordOrderEvent(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string
    type: string
    actor: string
    detail?: Prisma.InputJsonValue
  },
): Promise<void> {
  await tx.orderEvent.create({
    data: {
      orderId: input.orderId,
      type: input.type,
      actor: input.actor,
      detail: input.detail ?? {},
    },
  })
}

export async function findOrderByReference(reference: string) {
  return prisma.order.findUnique({
    where: { reference },
    include: { items: true, payment: true, delivery: true },
  })
}
