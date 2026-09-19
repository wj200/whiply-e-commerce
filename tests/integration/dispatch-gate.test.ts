import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { db, resetDatabase, seedSettings, seedLaunchCatalogue } from './helpers'

/**
 * Milestone D1 / GUARD-3 — THE DISPATCH GATE.
 *
 * "Done when: with the setting off, a paid order reaches READY_FOR_DELIVERY
 *  and an integration test asserts the courier client was NEVER CONSTRUCTED."
 *
 * These tests spy on every outbound courier function. With the gate off, not
 * one of them may be called — and because `runDispatch` imports the courier
 * path dynamically, with the gate off the module is never even evaluated.
 */

const courierCalls: string[] = []

vi.mock('@/lib/delivery/lalamove', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/delivery/lalamove')>()
  return {
    ...actual,
    requestQuotation: vi.fn(async () => {
      courierCalls.push('requestQuotation')
      return { quotationId: 'q_1', priceCents: 1340, expiresAt: null }
    }),
    placeOrder: vi.fn(async () => {
      courierCalls.push('placeOrder')
      return {
        providerRef: 'LLM-123',
        priceCents: 1340,
        shareLink: 'https://share.example/LLM-123',
        status: 'ASSIGNING_DRIVER',
      }
    }),
  }
})

const PICKUP = {
  line1: '8 Warehouse Way',
  line2: '#01-02',
  postalCode: '654321',
  contactName: 'WHIPLY Warehouse',
  contactPhone: '+6561234567',
}

async function paidOrder() {
  const { createPendingOrder } = await import('@/lib/domain/orders')
  const { settlePaidPayment } = await import('@/lib/domain/payment-settlement')

  const { order } = await createPendingOrder({
    lines: [{ sku: 'WHP-N2O-640', qty: 1 }],
    codeInput: null,
    contact: {
      name: 'Jane Baker',
      email: 'jane@example.com',
      phone: '91234567',
      addressLine1: '12 Kitchen Road',
      postalCode: '123456',
    },
  })

  await db.payment.create({
    data: {
      orderId: order.id,
      provider: 'hitpay',
      requestId: `req_${order.reference}`,
      amountCents: order.totalCents,
      paymentStatus: 'PENDING',
    },
  })

  await settlePaidPayment({
    reference: order.reference,
    paidAmountCents: order.totalCents,
    hitpayPaymentId: 'p',
    method: 'card',
    actor: 'test',
  })

  return order
}

describe('dispatch gate OFF — the shipped default (D1, GUARD-3)', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedSettings({ auto_dispatch_enabled: false, pickup_address: PICKUP })
    await seedLaunchCatalogue()
    const { invalidateSettings } = await import('@/lib/domain/settings')
    invalidateSettings()
    courierCalls.length = 0
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it('the DEFAULT setting is OFF', async () => {
    const { SETTING_DEFAULTS } = await import('@/lib/domain/settings-schema')
    expect(SETTING_DEFAULTS.auto_dispatch_enabled).toBe(false)
  })

  it('a paid order reaches READY_FOR_DELIVERY and NO courier call is made', async () => {
    const order = await paidOrder()
    const { runDispatch } = await import('@/lib/jobs/dispatch')

    const outcome = await runDispatch(order.id)

    expect(outcome.kind).toBe('GATE_OFF')
    expect(courierCalls).toEqual([]) // ← the assertion that matters

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { delivery: true, events: true },
    })
    expect(row.orderStatus).toBe('READY_FOR_DELIVERY')
    expect(row.delivery?.deliveryStatus).toBe('NOT_BOOKED')
    expect(row.delivery?.providerRef).toBeNull()
    expect(row.events.map((e) => e.type)).toContain('GATE_OFF')
  })

  it('makes no courier call even when the order is re-swept repeatedly', async () => {
    const order = await paidOrder()
    const { runDispatch, sweepPendingDispatches } = await import('@/lib/jobs/dispatch')

    await runDispatch(order.id)
    await sweepPendingDispatches()
    await sweepPendingDispatches()
    await runDispatch(order.id)

    expect(courierCalls).toEqual([])
  })

  it('makes no courier call even with a pickup address configured', async () => {
    const order = await paidOrder()
    const { runDispatch } = await import('@/lib/jobs/dispatch')
    await runDispatch(order.id)
    expect(courierCalls).toEqual([])
  })
})

describe('dispatch gate ON (D3)', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedSettings({ auto_dispatch_enabled: true, pickup_address: PICKUP })
    await seedLaunchCatalogue()
    const { invalidateSettings } = await import('@/lib/domain/settings')
    invalidateSettings()
    courierCalls.length = 0
  })

  it('quotes, places with the order id as idempotency key, and records BOTH costs', async () => {
    const order = await paidOrder()
    const { runDispatch } = await import('@/lib/jobs/dispatch')
    const lalamove = await import('@/lib/delivery/lalamove')

    const outcome = await runDispatch(order.id)

    expect(outcome).toMatchObject({ kind: 'BOOKED', providerRef: 'LLM-123' })
    expect(courierCalls).toEqual(['requestQuotation', 'placeOrder'])

    expect(vi.mocked(lalamove.placeOrder)).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: order.id }),
    )

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { delivery: true },
    })
    expect(row.orderStatus).toBe('DELIVERY_BOOKED')
    expect(row.delivery).toMatchObject({
      providerRef: 'LLM-123',
      estimatedCostCents: 1340,
      actualCostCents: 1340,
      deliveryStatus: 'DRIVER_ASSIGNED',
    })
  })

  it('the COURIER COST NEVER CHANGES what the customer was charged (§7.5)', async () => {
    const order = await paidOrder()
    const { runDispatch } = await import('@/lib/jobs/dispatch')
    await runDispatch(order.id)

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { delivery: true },
    })
    expect(row.deliveryFeeCents).toBe(2000) // what the customer paid
    expect(row.delivery?.actualCostCents).toBe(1340) // what the courier costs us
    expect(row.totalCents).toBe(order.totalCents) // unchanged
  })

  it('never books twice for one order', async () => {
    const order = await paidOrder()
    const { runDispatch } = await import('@/lib/jobs/dispatch')

    await runDispatch(order.id)
    const second = await runDispatch(order.id)

    expect(second.kind).toBe('ALREADY_BOOKED')
    expect(courierCalls.filter((c) => c === 'placeOrder')).toHaveLength(1)
    expect(await db.delivery.count()).toBe(1)
  })

  it('BLOCKS when the warehouse address is unset, and says so', async () => {
    await seedSettings({ auto_dispatch_enabled: true, pickup_address: null })
    const { invalidateSettings } = await import('@/lib/domain/settings')
    invalidateSettings()

    const order = await paidOrder()
    const { runDispatch } = await import('@/lib/jobs/dispatch')
    const outcome = await runDispatch(order.id)

    expect(outcome).toMatchObject({ kind: 'BLOCKED', reason: 'PICKUP_ADDRESS_UNSET' })
    expect(courierCalls).toEqual([])

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { delivery: true },
    })
    expect(row.orderStatus).toBe('READY_FOR_DELIVERY') // never lost
    expect(row.delivery?.failureReason).toMatch(/pickup address/i)
  })

  it('retries a transient failure, then stops at READY_FOR_DELIVERY with the reason', async () => {
    const lalamove = await import('@/lib/delivery/lalamove')
    vi.mocked(lalamove.requestQuotation).mockRejectedValue(
      new lalamove.LalamoveError('Lalamove 503', 503, true),
    )

    const order = await paidOrder()
    const { runDispatch } = await import('@/lib/jobs/dispatch')

    const first = await runDispatch(order.id)
    expect(first).toMatchObject({ kind: 'FAILED', willRetry: true })

    await runDispatch(order.id)
    const third = await runDispatch(order.id)
    expect(third).toMatchObject({ kind: 'FAILED', willRetry: false })

    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { delivery: true },
    })
    expect(row.orderStatus).toBe('READY_FOR_DELIVERY') // the order is never lost
    expect(row.delivery?.deliveryStatus).toBe('FAILED')
    expect(row.delivery?.attempts).toBe(3)
    expect(row.delivery?.failureReason).toContain('503')
  })

  it('does NOT retry a credentials rejection — no retry storm', async () => {
    const lalamove = await import('@/lib/delivery/lalamove')
    vi.mocked(lalamove.requestQuotation).mockRejectedValue(
      new lalamove.LalamoveError('Lalamove credentials rejected', 401, false, true),
    )

    const order = await paidOrder()
    const { runDispatch } = await import('@/lib/jobs/dispatch')
    const outcome = await runDispatch(order.id)

    expect(outcome).toMatchObject({ kind: 'FAILED', willRetry: false })
    const row = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { delivery: true },
    })
    expect(row.orderStatus).toBe('READY_FOR_DELIVERY')
    expect(row.delivery?.attempts).toBe(0) // not counted as a retryable attempt
  })
})
