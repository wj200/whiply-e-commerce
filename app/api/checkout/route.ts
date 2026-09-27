import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/client'
import { env } from '@/lib/config/env'
import { cartLineSchema, MAX_LINES } from '@/lib/cart/types'
import { checkoutContactSchema, deliveryChoiceSchema, resolveContactName } from '@/lib/domain/contact'
import { createPendingOrder, CheckoutError } from '@/lib/domain/orders'
import { createPaymentIntent, StripeError } from '@/lib/payments/stripe'
import { getSetting, getSlotRules } from '@/lib/domain/settings'
import { orderingWindow, validateSlotChoice } from '@/lib/domain/delivery-slots'
import { rateLimit } from '@/lib/ratelimit'
import { clientIp } from '@/lib/http/ip'
import { logger } from '@/lib/observability/logger'
import { cents } from '@/lib/money'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Blueprint §6.2 — the ONLY way an order comes into existence.
 *
 * The body carries SKUs, quantities, a code string, contact details and a
 * delivery choice. There is no field in which a price, a discount, a delivery
 * fee or a total can be expressed (GUARD-1), and no field that offers
 * self-collection (§6.1). The chosen slot is a bare timestamp, and the server
 * regenerates the whole set of legal slots to check it is one of them — the
 * picker in the browser is a courtesy, not a control.
 */
const bodySchema = z.object({
  lines: z.array(cartLineSchema).min(1).max(MAX_LINES),
  contact: checkoutContactSchema,
  delivery: deliveryChoiceSchema,
  code: z.string().max(64).nullable().optional(),
  idempotencyKey: z.string().min(8).max(64).optional(),
})

export async function POST(request: Request) {
  const ip = clientIp(request)
  const now = new Date()

  // Write path: fails CLOSED when the limiter is unavailable (§12.5).
  const limited = await rateLimit(`checkout:${ip}`, {
    limit: 10,
    windowSec: 600,
    failClosed: true,
  })
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many checkout attempts. Please wait a moment and try again.' },
      { status: 429 },
    )
  }

  if (!(await getSetting('store_open'))) {
    return NextResponse.json(
      { error: 'The store is temporarily not accepting orders. Please try again shortly.' },
      { status: 503 },
    )
  }

  // The clock closes the website independently of the operator's switch: no
  // orders after the cutoff, because the last slot of the day has passed the
  // point where it could still be given an hour's notice.
  const rules = await getSlotRules()
  const window = orderingWindow(now, rules)
  if (!window.open) {
    return NextResponse.json({ error: window.message, code: window.reason }, { status: 503 })
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Please check the details you entered.',
        fieldErrors: parsed.error.flatten().fieldErrors,
        contactErrors: parsed.error.flatten().fieldErrors.contact ?? undefined,
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
      { status: 400 },
    )
  }

  const { lines, contact, delivery, code, idempotencyKey } = parsed.data

  // GUARD-1 applied to time. A slot forty seconds away, or a 3am slot, or one
  // that was legal when the page rendered and is not now, is refused here.
  const slot = validateSlotChoice({
    method: delivery.method,
    startIso: delivery.slotStart,
    now,
    rules,
  })
  if (!slot.ok) {
    return NextResponse.json(
      { error: slot.message, code: slot.reason, field: 'delivery.slotStart' },
      { status: 409 },
    )
  }

  // A double-submitted form returns the FIRST order's payment URL rather than
  // creating a second order (§6.8).
  if (idempotencyKey) {
    const seen = await rateLimit(`checkout-idem:${idempotencyKey}`, {
      limit: 1,
      windowSec: 600,
    })
    if (!seen.ok) {
      const existing = await prisma.payment.findFirst({
        where: { order: { contactEmail: contact.email.trim() } },
        orderBy: { createdAt: 'desc' },
        include: { order: { select: { reference: true } } },
      })
      if (existing?.checkoutUrl) {
        return NextResponse.json({
          reference: existing.order.reference,
          checkoutUrl: existing.checkoutUrl,
          duplicate: true,
        })
      }
    }
  }

  let created
  try {
    created = await createPendingOrder({
      lines,
      contact,
      codeInput: code ?? null,
      delivery: { method: delivery.method, start: slot.start, end: slot.end },
      now,
    })
  } catch (error) {
    if (error instanceof CheckoutError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 })
    }
    throw error
  }

  const { order, codeError, issues } = created
  const config = env()
  const siteUrl = config.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')

  try {
    // PayNow is a PUSH method: this returns while the intent is still
    // `requires_action`, and the customer pays by scanning. Nothing here
    // marks the order paid — only the verified webhook does (§6.4).
    const intent = await createPaymentIntent({
      amount: cents(order.totalCents),
      reference: order.reference,
      email: contact.email.trim(),
      name: resolveContactName(contact),
      returnUrl: `${siteUrl}/checkout/success?ref=${order.reference}`,
    })

    if (!intent.hostedInstructionsUrl) {
      // Stripe accepted the intent but gave us nowhere to send the customer.
      // Better to fail the checkout than to show a dead end.
      logger.critical('checkout.no_paynow_qr', {
        reference: order.reference,
        intentId: intent.id,
        status: intent.status,
      })
      return NextResponse.json(
        { error: "We couldn't start the PayNow payment. Your cart is safe — please try again." },
        { status: 502 },
      )
    }

    await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: 'stripe',
        requestId: intent.id,
        amountCents: order.totalCents,
        currency: 'SGD',
        paymentStatus: 'PENDING',
        method: 'paynow',
        checkoutUrl: intent.hostedInstructionsUrl,
      },
    })

    logger.info('checkout.created', {
      reference: order.reference,
      totalCents: order.totalCents,
      itemCount: lines.length,
      deliveryMethod: delivery.method,
    })

    // The response is a checkout URL and a reference. No totals are echoed
    // back for the client to "confirm".
    return NextResponse.json({
      reference: order.reference,
      checkoutUrl: intent.hostedInstructionsUrl,
      codeError,
      issues,
    })
  } catch (error) {
    // The order stays PENDING_PAYMENT and is cleaned up by the expiry job.
    // No stock was ever held, so nothing needs releasing.
    logger.error('checkout.payment_intent_failed', {
      reference: order.reference,
      message: error instanceof Error ? error.message : 'unknown',
    })

    if (error instanceof StripeError) {
      return NextResponse.json(
        { error: "We couldn't reach the payment provider. Your cart is safe — please try again." },
        { status: 502 },
      )
    }
    throw error
  }
}
