import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import {
  db,
  resetDatabase,
  seedSettings,
  seedLaunchCatalogue,
  aValidSlot,
} from './helpers'

/**
 * Blueprint §8.5–8.6 — the two things that happen after money arrives.
 *
 * The property under test is ONE-SHOT-NESS, and it is enforced by the
 * `receipt_sent_at` / `notified_at` columns rather than by anyone remembering
 * to call this once. A failed send leaves its stamp NULL, which is exactly
 * what the sweep looks for — so failure is self-healing and needs no queue.
 */

Object.assign(process.env, {
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
  AUTH_SECRET: 'x'.repeat(32),
  CRON_SECRET: 'y'.repeat(16),
  STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_WEBHOOK_SECRET: 'whsec_x',
})

const receipt = { calls: 0, ok: true }
const alert = { calls: 0, ok: true }

// Only the network call is stubbed. The renderers underneath are the REAL
// ones, because what the receipt says is exactly what these tests check.
vi.mock('@/lib/notify/receipt-email', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/notify/receipt-email')>()),
  sendReceiptEmail: vi.fn(async () => {
    receipt.calls += 1
    return receipt.ok
      ? { sent: true as const, providerId: 'em_1' }
      : { sent: false as const, reason: 'SEND_FAILED' as const }
  }),
}))

vi.mock('@/lib/notify/whatsapp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/notify/whatsapp')>()),
  sendBusinessOrderAlert: vi.fn(async () => {
    alert.calls += 1
    return alert.ok
      ? { sent: true as const, messageId: 'wam_1' }
      : { sent: false as const, reason: 'SEND_FAILED' as const }
  }),
}))

async function paidOrder() {
  const { createPendingOrder } = await import('@/lib/domain/orders')
  const { settlePaidPayment } = await import('@/lib/domain/payment-settlement')
  const { order } = await createPendingOrder({
    lines: [{ sku: 'WHP-N2O-640-1', qty: 2 }],
    codeInput: null,
    delivery: aValidSlot(),
    contact: {
      email: 'chef@kitchen.sg',
      phone: '91234567',
      addressLine1: '12 Kitchen Road',
      addressLine2: '#04-05',
      postalCode: '123456',
      instructions: 'Lift lobby B',
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
  await settlePaidPayment({
    reference: order.reference,
    paidAmountCents: order.totalCents,
    providerPaymentId: `ch_${order.reference}`,
    method: 'paynow',
    actor: 'test',
  })
  return order
}

describe('runAfterPayment', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedSettings()
    await seedLaunchCatalogue()
    const { invalidateSettings } = await import('@/lib/domain/settings')
    invalidateSettings()
    receipt.calls = 0
    receipt.ok = true
    alert.calls = 0
    alert.ok = true
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it('sends both, and STAMPS them so a second run does not', async () => {
    const order = await paidOrder()
    const { runAfterPayment } = await import('@/lib/jobs/after-payment')

    const first = await runAfterPayment(order.id)
    expect(first).toMatchObject({ receipt: 'SENT', whatsapp: 'SENT' })

    const payment = await db.payment.findUniqueOrThrow({ where: { orderId: order.id } })
    expect(payment.receiptSentAt).not.toBeNull()
    expect(payment.notifiedAt).not.toBeNull()

    const second = await runAfterPayment(order.id)
    expect(second).toMatchObject({ receipt: 'ALREADY_SENT', whatsapp: 'ALREADY_SENT' })
    expect(receipt.calls).toBe(1)
    expect(alert.calls).toBe(1)
  })

  it('leaves the stamp NULL when a send fails, so the sweep retries it', async () => {
    receipt.ok = false
    const order = await paidOrder()
    const { runAfterPayment, sweepPendingNotifications } = await import(
      '@/lib/jobs/after-payment'
    )

    expect(await runAfterPayment(order.id)).toMatchObject({
      receipt: 'FAILED',
      whatsapp: 'SENT',
    })
    let payment = await db.payment.findUniqueOrThrow({ where: { orderId: order.id } })
    expect(payment.receiptSentAt).toBeNull()
    expect(payment.notifiedAt).not.toBeNull()

    // The provider recovers; the sweep picks it up and does NOT re-send the
    // WhatsApp alert that already went.
    receipt.ok = true
    const swept = await sweepPendingNotifications()
    expect(swept.considered).toBe(1)

    payment = await db.payment.findUniqueOrThrow({ where: { orderId: order.id } })
    expect(payment.receiptSentAt).not.toBeNull()
    expect(receipt.calls).toBe(2)
    expect(alert.calls).toBe(1)
  })

  it('a WhatsApp outage NEVER blocks the receipt, or the fulfilment record', async () => {
    alert.ok = false
    const order = await paidOrder()
    const { runAfterPayment } = await import('@/lib/jobs/after-payment')

    const result = await runAfterPayment(order.id)
    expect(result).toMatchObject({
      fulfilmentOpened: true,
      receipt: 'SENT',
      whatsapp: 'FAILED',
    })
    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { delivery: true },
    })
    expect(row.delivery?.deliveryStatus).toBe('SCHEDULED')
  })

  it('the sweep ignores orders whose notifications are both done', async () => {
    const order = await paidOrder()
    const { runAfterPayment, sweepPendingNotifications } = await import(
      '@/lib/jobs/after-payment'
    )
    await runAfterPayment(order.id)
    expect((await sweepPendingNotifications()).considered).toBe(0)
  })

  it('the sweep ignores unpaid orders entirely', async () => {
    const { createPendingOrder } = await import('@/lib/domain/orders')
    const { order } = await createPendingOrder({
      lines: [{ sku: 'WHP-N2O-640-1', qty: 1 }],
      codeInput: null,
      delivery: aValidSlot(),
      contact: {
        email: 'never@paid.sg',
        phone: '91234567',
        addressLine1: '1 Road',
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
    const { sweepPendingNotifications } = await import('@/lib/jobs/after-payment')
    expect((await sweepPendingNotifications()).considered).toBe(0)
    expect(receipt.calls).toBe(0)
  })
})

describe('what the notifications actually say', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedSettings()
    await seedLaunchCatalogue()
    const { invalidateSettings } = await import('@/lib/domain/settings')
    invalidateSettings()
  })

  async function notifiable() {
    const order = await paidOrder()
    const { toNotifiable } = await import('@/lib/jobs/after-payment')
    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true, payment: true, discountCode: { select: { code: true } } },
    })
    return toNotifiable(row)
  }

  it('the receipt states the goods, the money and the slot', async () => {
    const { receiptText } = await import('@/lib/notify/receipt-email')
    const text = receiptText(await notifiable())

    expect(text).toContain('640g N₂O Cream Charger — 1 Tank')
    expect(text).toContain('S$80.00') // 2 × S$40
    expect(text).toContain('Total paid: S$90.00') // + S$10 standard delivery
    expect(text).toContain('Standard (2–3 working days)')
    expect(text).toContain('12 Kitchen Road')
    expect(text).toContain('#04-05')
    expect(text).toContain('Singapore 123456')
    expect(text).toContain('Lift lobby B')
    expect(text).toContain('+6591234567')
  })

  it('the receipt HTML escapes anything the customer typed', async () => {
    const { receiptHtml } = await import('@/lib/notify/receipt-email')
    const order = await notifiable()
    const html = receiptHtml({
      ...order,
      instructions: '<script>alert(1)</script>',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('the WhatsApp template parameters are single-line, as Meta requires', async () => {
    const { templateParameters } = await import('@/lib/notify/whatsapp')
    const params = templateParameters(await notifiable())

    expect(params).toHaveLength(4)
    for (const p of params) {
      expect(p).not.toMatch(/\n/)
      expect(p).not.toMatch(/ {4}/)
      expect(p.length).toBeGreaterThan(0)
    }
    expect(params[1]).toBe('S$90.00')
    expect(params[3]).toContain('2 × 640g N₂O Cream Charger — 1 Tank')
  })

  it('the free-form alert carries the address and the contact', async () => {
    const { alertText } = await import('@/lib/notify/whatsapp')
    const text = alertText(await notifiable())
    expect(text).toContain('NEW ORDER')
    expect(text).toContain('12 Kitchen Road')
    expect(text).toContain('chef@kitchen.sg')
    expect(text).toContain('+6591234567')
  })
})
