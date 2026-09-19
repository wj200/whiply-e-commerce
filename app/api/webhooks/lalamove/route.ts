import { NextResponse } from 'next/server'
import { z } from 'zod'
import { env } from '@/lib/config/env'
import { verifySignature } from '@/lib/payments/signature'
import { claimWebhookEvent } from '@/lib/domain/payment-settlement'
import { applyDeliveryStatus } from '@/lib/domain/delivery-status'
import { mapLalamoveStatus } from '@/lib/delivery/lalamove'
import { logger } from '@/lib/observability/logger'
import { clientIp } from '@/lib/http/ip'

/**
 * Blueprint §7.4 / D4 — courier status updates.
 *
 * Same discipline as the payment webhook: verify, de-duplicate, then apply
 * through one guarded function. Returns 200 for anything understood-but-
 * unusable so the provider does not retry forever (§12.4 rule 2).
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const payloadSchema = z.object({
  eventId: z.string().optional(),
  eventType: z.string().optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
  data: z
    .object({
      order: z
        .object({
          orderId: z.string().optional(),
          status: z.string().optional(),
          shareLink: z.string().optional(),
          priceBreakdown: z.object({ total: z.string() }).partial().optional(),
        })
        .optional(),
      driver: z
        .object({
          name: z.string().optional(),
          phone: z.string().optional(),
          plateNumber: z.string().optional(),
        })
        .optional(),
      updatedAt: z.string().optional(),
    })
    .optional(),
})

export async function POST(request: Request) {
  const config = env()
  const rawBody = await request.text()

  const signature =
    request.headers.get('x-lalamove-signature') ??
    request.headers.get('signature') ??
    request.headers.get('x-signature')

  if (!verifySignature(rawBody, signature, config.LALAMOVE_WEBHOOK_SECRET)) {
    logger.critical('webhook.lalamove.signature_mismatch', {
      ip: clientIp(request),
      hasHeader: Boolean(signature),
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    logger.warn('webhook.lalamove.malformed_json')
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const parsed = payloadSchema.safeParse(json)
  if (!parsed.success) {
    logger.warn('webhook.lalamove.unreadable_payload')
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const order = parsed.data.data?.order
  const providerRef = order?.orderId
  const rawStatus = order?.status

  if (!providerRef || !rawStatus) {
    logger.warn('webhook.lalamove.missing_fields', {
      hasRef: Boolean(providerRef),
      hasStatus: Boolean(rawStatus),
    })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // De-duplicate on the provider's event id where present; otherwise on the
  // (order, status) pair, which is the natural key for a status transition.
  const eventId = parsed.data.eventId ?? `${providerRef}:${rawStatus}`
  const claimed = await claimWebhookEvent({ provider: 'lalamove', eventId, rawBody })
  if (!claimed) {
    logger.info('webhook.lalamove.duplicate', { eventId, providerRef })
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 })
  }

  const status = mapLalamoveStatus(rawStatus)
  if (!status) {
    // An unmapped status is LOGGED, never thrown (§7.4).
    logger.warn('webhook.lalamove.unmapped_status', { providerRef, rawStatus })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const driverRaw = parsed.data.data?.driver
  const driver = driverRaw
    ? {
        name: driverRaw.name ?? null,
        phone: driverRaw.phone ?? null,
        plateNumber: driverRaw.plateNumber ?? null,
      }
    : null

  let actualCostCents: number | null = null
  const total = order.priceBreakdown?.total
  if (total) {
    const value = Number.parseFloat(total)
    if (Number.isFinite(value)) actualCostCents = Math.round(value * 100)
  }

  const outcome = await applyDeliveryStatus({
    providerRef,
    status,
    actor: 'webhook:lalamove',
    driver,
    trackingUrl: order.shareLink ?? null,
    actualCostCents,
  })

  if (outcome.kind === 'DELIVERY_NOT_FOUND') {
    logger.error('webhook.lalamove.delivery_not_found', { providerRef })
  }

  return NextResponse.json({ received: true, outcome: outcome.kind }, { status: 200 })
}
