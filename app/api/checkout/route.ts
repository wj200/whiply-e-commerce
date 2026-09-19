import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/client'
import { env } from '@/lib/config/env'
import { cartLineSchema, MAX_LINES } from '@/lib/cart/types'
import { checkoutContactSchema } from '@/lib/domain/contact'
import { createPendingOrder, CheckoutError } from '@/lib/domain/orders'
import { createPaymentRequest, HitPayError } from '@/lib/payments/hitpay'
import { getSetting } from '@/lib/domain/settings'
import { rateLimit } from '@/lib/ratelimit'
import { clientIp } from '@/lib/http/ip'
import { logger } from '@/lib/observability/logger'
import { cents } from '@/lib/money'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Blueprint §6.2 — the ONLY way an order comes into existence.
 *
 * The body carries SKUs, quantities, a code string and contact details.
 * There is no field in which a price, a discount or a total can be expressed
 * (GUARD-1), and no field that offers self-collection (§6.1).
 */
const bodySchema = z.object({
  lines: z.array(cartLineSchema).min(1).max(MAX_LINES),
  contact: checkoutContactSchema,
  code: z.string().max(64).nullable().optional(),
  idempotencyKey: z.string().min(8).max(64).optional(),
})

export async function POST(request: Request) {
  const ip = clientIp(request)

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

  const { lines, contact, code, idempotencyKey } = parsed.data

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
    created = await createPendingOrder({ lines, contact, codeInput: code ?? null })
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
    const payment = await createPaymentRequest({
      amount: cents(order.totalCents),
      reference: order.reference,
      email: contact.email.trim(),
      name: contact.name,
      redirectUrl: `${siteUrl}/checkout/success?ref=${order.reference}`,
      webhookUrl: `${siteUrl}/api/webhooks/hitpay`,
    })

    await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: 'hitpay',
        requestId: payment.id,
        amountCents: order.totalCents,
        currency: 'SGD',
        paymentStatus: 'PENDING',
        checkoutUrl: payment.url,
      },
    })

    logger.info('checkout.created', {
      reference: order.reference,
      totalCents: order.totalCents,
      itemCount: lines.length,
    })

    // The response is a checkout URL and a reference. No totals are echoed
    // back for the client to "confirm".
    return NextResponse.json({
      reference: order.reference,
      checkoutUrl: payment.url,
      codeError,
      issues,
    })
  } catch (error) {
    // The order stays PENDING_PAYMENT and is cleaned up by the expiry job.
    // No stock was ever held, so nothing needs releasing.
    logger.error('checkout.payment_request_failed', {
      reference: order.reference,
      message: error instanceof Error ? error.message : 'unknown',
    })

    if (error instanceof HitPayError) {
      return NextResponse.json(
        { error: "We couldn't reach the payment provider. Your cart is safe — please try again." },
        { status: 502 },
      )
    }
    throw error
  }
}
