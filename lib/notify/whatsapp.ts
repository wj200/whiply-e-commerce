import 'server-only'
import { env } from '@/lib/config/env'
import { formatSgd, cents } from '@/lib/money'
import { logger } from '@/lib/observability/logger'
import {
  addressLines,
  itemSummary,
  methodLabel,
  slotLabel,
  type NotifiableOrder,
} from './order-summary'

/**
 * Blueprint §8.6 — THE BUSINESS ORDER ALERT.
 *
 * Sent to the shop's own WhatsApp Business number the moment a payment is
 * verified, so someone knows to pack a box without watching a dashboard.
 *
 * The thing that most often breaks this integration in production, stated
 * plainly because it is not obvious from the API:
 *
 *   Meta only allows FREE-FORM text to a number inside a 24-hour "customer
 *   service window", which opens when that number messages the business
 *   first. An order alert is business-initiated and there is no such window,
 *   so it MUST be sent as a pre-approved TEMPLATE. Free-form text will be
 *   accepted by the API and then silently not delivered.
 *
 * So the template path is the default, and the free-form path exists only for
 * local testing (`WHATSAPP_TEMPLATE_NAME=""`). The exact template body that
 * must be submitted to Meta is in docs/CREDENTIALS.md; its four positional
 * parameters are produced by `templateParameters` below and the two must be
 * changed together.
 */

export type WhatsAppResult =
  | { sent: true; messageId: string | null }
  | { sent: false; reason: 'NOT_CONFIGURED' | 'SEND_FAILED'; detail?: string }

/**
 * The four `{{1}}`–`{{4}}` values. Meta rejects a parameter containing a
 * newline or a run of four spaces, so every value here is single-line.
 */
export function templateParameters(order: NotifiableOrder): string[] {
  return [
    order.reference,
    formatSgd(cents(order.totalCents), { alwaysCents: true }),
    `${methodLabel(order.deliveryMethod)} — ${slotLabel(order)}`,
    itemSummary(order),
  ].map(oneLine)
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 900) || '—'
}

/** The free-form body, used in development and as the template's model. */
export function alertText(order: NotifiableOrder): string {
  return [
    `NEW ORDER ${order.reference}`,
    `${formatSgd(cents(order.totalCents), { alwaysCents: true })} · paid by PayNow`,
    '',
    ...order.items.map((i) => `• ${i.quantity} × ${i.nameAtPurchase}`),
    '',
    methodLabel(order.deliveryMethod),
    slotLabel(order),
    '',
    ...addressLines(order),
    order.instructions ? `Particulars: ${order.instructions}` : '',
    '',
    `${order.contactName} · ${order.contactPhone}`,
    order.contactEmail,
  ]
    .filter((line) => line !== '')
    .join('\n')
}

export async function sendBusinessOrderAlert(order: NotifiableOrder): Promise<WhatsAppResult> {
  const config = env()
  const phoneNumberId = config.WHATSAPP_PHONE_NUMBER_ID
  const token = config.WHATSAPP_ACCESS_TOKEN
  const to = config.WHATSAPP_BUSINESS_NUMBER

  // Production refuses to boot without these (§14.2); locally this is a
  // loud no-op rather than a crash.
  if (!phoneNumberId || !token || !to) {
    logger.warn('whatsapp.not_configured', { reference: order.reference })
    return { sent: false, reason: 'NOT_CONFIGURED' }
  }

  const useTemplate = config.WHATSAPP_TEMPLATE_NAME.length > 0

  const payload = useTemplate
    ? {
        messaging_product: 'whatsapp',
        // Meta wants the recipient without the leading '+'.
        to: to.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: config.WHATSAPP_TEMPLATE_NAME,
          language: { code: config.WHATSAPP_TEMPLATE_LANGUAGE },
          components: [
            {
              type: 'body',
              parameters: templateParameters(order).map((text) => ({ type: 'text', text })),
            },
          ],
        },
      }
    : {
        messaging_product: 'whatsapp',
        to: to.replace(/^\+/, ''),
        type: 'text',
        text: { preview_url: false, body: alertText(order) },
      }

  try {
    const res = await fetch(
      `${config.WHATSAPP_API_BASE.replace(/\/$/, '')}/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      },
    )

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      logger.error('whatsapp.send_failed', {
        reference: order.reference,
        status: res.status,
        body: body.slice(0, 300),
      })
      return { sent: false, reason: 'SEND_FAILED', detail: `HTTP ${res.status}` }
    }

    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id?: string }[]
    }
    logger.info('whatsapp.sent', { reference: order.reference, template: useTemplate })
    return { sent: true, messageId: json.messages?.[0]?.id ?? null }
  } catch (error) {
    logger.error('whatsapp.send_error', {
      reference: order.reference,
      message: error instanceof Error ? error.message : 'unknown',
    })
    return {
      sent: false,
      reason: 'SEND_FAILED',
      detail: error instanceof Error ? error.message : 'unknown',
    }
  }
}
