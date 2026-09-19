import 'server-only'
import { createHmac } from 'node:crypto'
import { z } from 'zod'
import { env } from '@/lib/config/env'
import { cents, type Cents } from '@/lib/money'
import type { DeliveryStatus } from '@/lib/generated/prisma'

/**
 * Blueprint §7.3 — THE ONLY MODULE THAT KNOWS LALAMOVE'S API SHAPE.
 *
 * Requests are signed with HMAC over a canonical string of timestamp, method,
 * path and body. Get the canonical string wrong and every call 401s
 * identically, which is why it is built in one place with one test.
 *
 * Verify endpoints and field names against live documentation (§16.3).
 */

export class LalamoveError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryable = false,
    public readonly isAuthError = false,
  ) {
    super(message)
    this.name = 'LalamoveError'
  }
}

export type LatLng = { lat: string; lng: string }

export type Stop = {
  address: string
  coordinates?: LatLng
  name: string
  phone: string
}

export type Quotation = {
  quotationId: string
  priceCents: Cents
  expiresAt: Date | null
}

export type PlacedOrder = {
  providerRef: string
  priceCents: Cents | null
  shareLink: string | null
  status: string
}

export type DriverDetails = {
  name: string | null
  phone: string | null
  plateNumber: string | null
}

/**
 * §7.4 — the status map lives in ONE exported table, not in scattered
 * conditionals, so a provider adding a status is a one-line change and an
 * unmapped status is logged rather than crashing the webhook handler.
 */
export const LALAMOVE_STATUS_MAP: Record<string, DeliveryStatus> = {
  ASSIGNING_DRIVER: 'BOOKING',
  PENDING: 'BOOKING',
  ON_GOING: 'DRIVER_ASSIGNED',
  DRIVER_ASSIGNED: 'DRIVER_ASSIGNED',
  PICKED_UP: 'PICKED_UP',
  IN_TRANSIT: 'IN_TRANSIT',
  COMPLETED: 'DELIVERED',
  DELIVERED: 'DELIVERED',
  CANCELED: 'CANCELLED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'FAILED',
  EXPIRED: 'FAILED',
}

export function mapLalamoveStatus(raw: string): DeliveryStatus | null {
  return LALAMOVE_STATUS_MAP[raw.trim().toUpperCase()] ?? null
}

const quotationResponse = z.object({
  data: z.object({
    quotationId: z.string(),
    priceBreakdown: z.object({ total: z.string(), currency: z.string() }),
    expiresAt: z.string().optional(),
  }),
})

const orderResponse = z.object({
  data: z.object({
    orderId: z.string(),
    status: z.string(),
    shareLink: z.string().optional(),
    priceBreakdown: z.object({ total: z.string() }).optional(),
    driverId: z.string().optional(),
  }),
})

const driverResponse = z.object({
  data: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    plateNumber: z.string().optional(),
  }),
})

const TIMEOUT_MS = 12_000

export async function requestQuotation(input: {
  pickup: Stop
  dropoff: Stop
  serviceType: string
}): Promise<Quotation> {
  const body = {
    data: {
      serviceType: input.serviceType,
      language: 'en_SG',
      stops: [toStop(input.pickup), toStop(input.dropoff)],
    },
  }

  const json = await signedRequest('POST', '/v3/quotations', body)
  const parsed = quotationResponse.safeParse(json)
  if (!parsed.success) throw new LalamoveError('Lalamove returned a quotation we could not read')

  return {
    quotationId: parsed.data.data.quotationId,
    priceCents: parseMoney(parsed.data.data.priceBreakdown.total),
    expiresAt: parsed.data.data.expiresAt ? new Date(parsed.data.data.expiresAt) : null,
  }
}

export async function placeOrder(input: {
  quotationId: string
  pickup: Stop
  dropoff: Stop
  /** WHIPLY order id — the idempotency key (§19.3). */
  idempotencyKey: string
  remarks?: string
}): Promise<PlacedOrder> {
  const body = {
    data: {
      quotationId: input.quotationId,
      sender: { stopId: '0', name: input.pickup.name, phone: input.pickup.phone },
      recipients: [
        {
          stopId: '1',
          name: input.dropoff.name,
          phone: input.dropoff.phone,
          remarks: input.remarks ?? '',
        },
      ],
      isPODEnabled: true,
      metadata: { whiplyOrderId: input.idempotencyKey },
    },
  }

  const json = await signedRequest('POST', '/v3/orders', body, {
    'Idempotency-Key': input.idempotencyKey,
  })
  const parsed = orderResponse.safeParse(json)
  if (!parsed.success) throw new LalamoveError('Lalamove returned an order we could not read')

  return {
    providerRef: parsed.data.data.orderId,
    priceCents: parsed.data.data.priceBreakdown
      ? parseMoney(parsed.data.data.priceBreakdown.total)
      : null,
    shareLink: parsed.data.data.shareLink ?? null,
    status: parsed.data.data.status,
  }
}

export async function getOrder(providerRef: string): Promise<PlacedOrder & { driverId?: string }> {
  const json = await signedRequest('GET', `/v3/orders/${encodeURIComponent(providerRef)}`)
  const parsed = orderResponse.safeParse(json)
  if (!parsed.success) throw new LalamoveError('Lalamove returned an order we could not read')
  return {
    providerRef: parsed.data.data.orderId,
    priceCents: parsed.data.data.priceBreakdown
      ? parseMoney(parsed.data.data.priceBreakdown.total)
      : null,
    shareLink: parsed.data.data.shareLink ?? null,
    status: parsed.data.data.status,
    driverId: parsed.data.data.driverId,
  }
}

export async function getDriver(providerRef: string, driverId: string): Promise<DriverDetails> {
  const json = await signedRequest(
    'GET',
    `/v3/orders/${encodeURIComponent(providerRef)}/drivers/${encodeURIComponent(driverId)}`,
  )
  const parsed = driverResponse.safeParse(json)
  if (!parsed.success) return { name: null, phone: null, plateNumber: null }
  return {
    name: parsed.data.data.name ?? null,
    phone: parsed.data.data.phone ?? null,
    plateNumber: parsed.data.data.plateNumber ?? null,
  }
}

export async function cancelOrder(providerRef: string): Promise<void> {
  await signedRequest('DELETE', `/v3/orders/${encodeURIComponent(providerRef)}`)
}

function toStop(stop: Stop) {
  return {
    coordinates: stop.coordinates ?? { lat: '', lng: '' },
    address: stop.address,
  }
}

/**
 * The canonical string. Lalamove signs:
 *   {timestamp}\r\n{METHOD}\r\n{path}\r\n\r\n{body}
 * and the Authorization header is `hmac {apiKey}:{timestamp}:{signature}`.
 */
export function buildSignature(input: {
  timestamp: string
  method: string
  path: string
  body: string
  secret: string
}): string {
  const canonical = `${input.timestamp}\r\n${input.method}\r\n${input.path}\r\n\r\n${input.body}`
  return createHmac('sha256', input.secret).update(canonical).digest('hex')
}

async function signedRequest(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<unknown> {
  const config = env()
  const timestamp = String(Date.now())
  const serialised = body ? JSON.stringify(body) : ''

  const signature = buildSignature({
    timestamp,
    method,
    path,
    body: serialised,
    secret: config.LALAMOVE_API_SECRET,
  })

  const res = await fetch(`${config.LALAMOVE_API_BASE.replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      Authorization: `hmac ${config.LALAMOVE_API_KEY}:${timestamp}:${signature}`,
      Market: config.LALAMOVE_MARKET,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...extraHeaders,
    },
    body: serialised || undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((error: unknown) => {
    throw new LalamoveError(
      `Could not reach Lalamove: ${error instanceof Error ? error.message : 'unknown'}`,
      undefined,
      true,
    )
  })

  if (res.status === 401 || res.status === 403) {
    // No retry storm: one alert, dispatch paused, orders accumulate safely.
    throw new LalamoveError('Lalamove credentials rejected', res.status, false, true)
  }
  if (res.status === 429 || res.status >= 500) {
    throw new LalamoveError(`Lalamove ${res.status}`, res.status, true)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new LalamoveError(`Lalamove ${res.status}: ${text.slice(0, 200)}`, res.status, false)
  }

  if (res.status === 204) return { data: {} }
  return res.json()
}

function parseMoney(total: string): Cents {
  const value = Number.parseFloat(total)
  if (!Number.isFinite(value)) throw new LalamoveError(`Unparseable courier price: ${total}`)
  return cents(Math.round(value * 100))
}
