import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import {
  db,
  resetDatabase,
  seedSettings,
  seedLaunchCatalogue,
  aValidSlot,
} from './helpers'
import { buildStripeSignatureHeader } from '@/lib/payments/signature'

/**
 * Blueprint §6.4 — the webhook END TO END, through the real route handler.
 *
 * These are the tests that matter most in the whole suite: everything that
 * makes an order real happens here, and every one of these failures would be
 * a customer who paid and got nothing, or goods shipped for free.
 */

const WEBHOOK_SECRET = 'whsec_integration_test'

Object.assign(process.env, {
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
  AUTH_SECRET: 'x'.repeat(32),
  CRON_SECRET: 'y'.repeat(16),
  STRIPE_SECRET_KEY: 'sk_test_integration',
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
})

const sent = { receipts: 0, alerts: 0 }

vi.mock('@/lib/notify/receipt-email', () => ({
  sendReceiptEmail: vi.fn(async () => {
    sent.receipts += 1
    return { sent: true, providerId: 'em_1' }
  }),
}))
vi.mock('@/lib/notify/whatsapp', () => ({
  sendBusinessOrderAlert: vi.fn(async () => {
    sent.alerts += 1
    return { sent: true, messageId: 'wam_1' }
  }),
}))

async function pendingOrder() {
  const { createPendingOrder } = await import('@/lib/domain/orders')
  const { order } = await createPendingOrder({
    lines: [{ sku: 'WHP-N2O-640-1', qty: 1 }],
    codeInput: null,
    delivery: aValidSlot(),
    contact: {
      email: 'chef@kitchen.sg',
      phone: '91234567',
      addressLine1: '12 Kitchen Road',
      postalCode: '123456',
    },
  })
  await db.payment.create({
    data: {
      orderId: order.id,
      provider: 'stripe',
      requestId: `pi_${order.reference}`,
      amountCents: order.totalCents,
      paymentStatus: 'PENDING',
    },
  })
  return order
}

function intentEvent(opts: {
  eventId: string
  type?: string
  reference: string
  amountReceived: number
  intentId?: string
}) {
  return JSON.stringify({
    id: opts.eventId,
    type: opts.type ?? 'payment_intent.succeeded',
    data: {
      object: {
        id: opts.intentId ?? `pi_${opts.reference}`,
        object: 'payment_intent',
        status: 'succeeded',
        amount: opts.amountReceived,
        amount_received: opts.amountReceived,
        currency: 'sgd',
        latest_charge: `ch_${opts.reference}`,
        metadata: { reference: opts.reference, source: 'whiply-storefront' },
      },
    },
  })
}

async function post(rawBody: string, header?: string | null) {
  const { POST } = await import('@/app/api/webhooks/stripe/route')
  const signature =
    header === undefined
      ? buildStripeSignatureHeader({
          rawBody,
          secret: WEBHOOK_SECRET,
          timestamp: Math.floor(Date.now() / 1000),
        })
      : header

  return POST(
    new Request('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      headers: signature ? { 'stripe-signature': signature } : {},
      body: rawBody,
    }),
  )
}

describe('POST /api/webhooks/stripe (GUARD-2)', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedSettings()
    await seedLaunchCatalogue()
    const { invalidateSettings } = await import('@/lib/domain/settings')
    invalidateSettings()
    sent.receipts = 0
    sent.alerts = 0
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it('settles a paid order, schedules it, and sends both notifications', async () => {
    const order = await pendingOrder()
    const res = await post(
      intentEvent({ eventId: 'evt_1', reference: order.reference, amountReceived: order.totalCents }),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ outcome: 'PAID' })

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { payment: true, delivery: true },
    })
    expect(row.orderStatus).toBe('DELIVERY_BOOKED')
    expect(row.payment?.paymentStatus).toBe('PAID')
    expect(row.payment?.paymentId).toBe(`ch_${order.reference}`)
    expect(row.delivery?.deliveryStatus).toBe('SCHEDULED')
    expect(sent).toEqual({ receipts: 1, alerts: 1 })
  })

  it('REJECTS an unsigned request with 401 and changes nothing', async () => {
    const order = await pendingOrder()
    const res = await post(
      intentEvent({ eventId: 'evt_2', reference: order.reference, amountReceived: order.totalCents }),
      null,
    )
    expect(res.status).toBe(401)
    const row = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(row.orderStatus).toBe('PENDING_PAYMENT')
    expect(sent.receipts).toBe(0)
  })

  it('REJECTS a body altered after signing', async () => {
    const order = await pendingOrder()
    const body = intentEvent({
      eventId: 'evt_3',
      reference: order.reference,
      amountReceived: order.totalCents,
    })
    const signature = buildStripeSignatureHeader({
      rawBody: body,
      secret: WEBHOOK_SECRET,
      timestamp: Math.floor(Date.now() / 1000),
    })
    // Same signature, different body: the amount has been inflated.
    const tampered = body.replace(`"amount_received":${order.totalCents}`, '"amount_received":1')
    const res = await post(tampered, signature)
    expect(res.status).toBe(401)
  })

  it('REJECTS a valid signature made with the WRONG secret', async () => {
    const order = await pendingOrder()
    const body = intentEvent({
      eventId: 'evt_4',
      reference: order.reference,
      amountReceived: order.totalCents,
    })
    const res = await post(
      body,
      buildStripeSignatureHeader({
        rawBody: body,
        secret: 'whsec_attacker',
        timestamp: Math.floor(Date.now() / 1000),
      }),
    )
    expect(res.status).toBe(401)
  })

  it('REJECTS a replay of a signature from an hour ago', async () => {
    const order = await pendingOrder()
    const body = intentEvent({
      eventId: 'evt_5',
      reference: order.reference,
      amountReceived: order.totalCents,
    })
    const res = await post(
      body,
      buildStripeSignatureHeader({
        rawBody: body,
        secret: WEBHOOK_SECRET,
        timestamp: Math.floor(Date.now() / 1000) - 3600,
      }),
    )
    expect(res.status).toBe(401)
  })

  it('THE REPLAY TEST — the same event five times sends ONE receipt and deducts stock ONCE', async () => {
    const order = await pendingOrder()
    const body = intentEvent({
      eventId: 'evt_dup',
      reference: order.reference,
      amountReceived: order.totalCents,
    })

    const before = await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640-1' } })
    for (let i = 0; i < 5; i += 1) await post(body)
    const after = await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640-1' } })

    expect(after.stockQty).toBe(before.stockQty - 1)
    expect(sent).toEqual({ receipts: 1, alerts: 1 })
    expect(await db.webhookEvent.count()).toBe(1)
    expect(
      await db.orderEvent.count({ where: { orderId: order.id, type: 'PAID' } }),
    ).toBe(1)
  })

  it('AMOUNT MISMATCH goes to REVIEW, ships nothing and tells nobody it is confirmed', async () => {
    const order = await pendingOrder()
    const res = await post(
      intentEvent({ eventId: 'evt_short', reference: order.reference, amountReceived: 100 }),
    )
    expect(res.status).toBe(200)

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { delivery: true },
    })
    expect(row.orderStatus).toBe('REVIEW')
    expect(row.delivery).toBeNull()
    expect(sent).toEqual({ receipts: 0, alerts: 0 })
  })

  it('a FAILED intent cancels the order', async () => {
    const order = await pendingOrder()
    const body = intentEvent({
      eventId: 'evt_fail',
      type: 'payment_intent.payment_failed',
      reference: order.reference,
      amountReceived: 0,
    })
    await post(body)

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { payment: true },
    })
    expect(row.orderStatus).toBe('CANCELLED')
    expect(row.payment?.paymentStatus).toBe('FAILED')
  })

  it('a CANCELED intent expires the order — an unscanned PayNow QR', async () => {
    const order = await pendingOrder()
    await post(
      intentEvent({
        eventId: 'evt_cancel',
        type: 'payment_intent.canceled',
        reference: order.reference,
        amountReceived: 0,
      }),
    )
    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { payment: true },
    })
    expect(row.payment?.paymentStatus).toBe('EXPIRED')
  })

  it('ACKNOWLEDGES an event it cannot use — a 500 would make Stripe retry forever', async () => {
    // A PaymentIntent created outside this storefront: signed, valid, and
    // about nothing we know.
    const res = await post(
      JSON.stringify({
        id: 'evt_foreign',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_elsewhere',
            object: 'payment_intent',
            status: 'succeeded',
            amount: 100,
            amount_received: 100,
            currency: 'sgd',
            metadata: {},
          },
        },
      }),
    )
    expect(res.status).toBe(200)
  })

  it('ACKNOWLEDGES an unhandled event type without acting on it', async () => {
    const order = await pendingOrder()
    const res = await post(
      intentEvent({
        eventId: 'evt_processing',
        type: 'payment_intent.processing',
        reference: order.reference,
        amountReceived: order.totalCents,
      }),
    )
    expect(res.status).toBe(200)
    const row = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(row.orderStatus).toBe('PENDING_PAYMENT')
  })

  it('ACKNOWLEDGES a malformed body rather than 500ing', async () => {
    const res = await post('not json at all')
    expect(res.status).toBe(200)
  })

  it('reports an unknown reference loudly but with 200', async () => {
    const res = await post(
      intentEvent({ eventId: 'evt_ghost', reference: 'WHP-19700101-AAAAA', amountReceived: 5000 }),
    )
    expect(res.status).toBe(200)
  })
})
