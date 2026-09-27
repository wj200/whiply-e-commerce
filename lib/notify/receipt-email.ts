import 'server-only'
import { env } from '@/lib/config/env'
import { formatSgd, cents } from '@/lib/money'
import { logger } from '@/lib/observability/logger'
import {
  addressLines,
  methodLabel,
  slotLabel,
  totalsRows,
  type NotifiableOrder,
} from './order-summary'

/**
 * Blueprint §8.5 — THE CUSTOMER RECEIPT.
 *
 * One email, sent once, after payment is TRUE. It is an invoice: what was
 * bought, what it cost, where it is going and when. It contains no tracking
 * pixel, no marketing, and no link that changes anything — a receipt is a
 * record, not a campaign.
 *
 * It is sent from the settlement pipeline, never from the checkout route:
 * an email that says "payment received" must be caused by a verified webhook
 * and nothing else (§6.4).
 */

export type ReceiptResult =
  | { sent: true; providerId: string | null }
  | { sent: false; reason: 'NOT_CONFIGURED' | 'SEND_FAILED'; detail?: string }

export async function sendReceiptEmail(order: NotifiableOrder): Promise<ReceiptResult> {
  const config = env()
  const apiKey = config.RESEND_API_KEY
  const from = config.RESEND_FROM_EMAIL

  // Production refuses to boot without these (§14.2), so this branch is a
  // local-development convenience — and it is LOUD, not silent.
  if (!apiKey || !from) {
    logger.warn('receipt.not_configured', { reference: order.reference })
    return { sent: false, reason: 'NOT_CONFIGURED' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Resend deduplicates on this, so a retried send after a timeout
        // cannot produce a second invoice for the same order.
        'Idempotency-Key': `receipt:${order.reference}`,
      },
      body: JSON.stringify({
        from,
        to: [order.contactEmail],
        subject: `WHIPLY receipt — order ${order.reference}`,
        text: receiptText(order),
        html: receiptHtml(order),
      }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      logger.error('receipt.send_failed', {
        reference: order.reference,
        status: res.status,
        body: body.slice(0, 300),
      })
      return { sent: false, reason: 'SEND_FAILED', detail: `HTTP ${res.status}` }
    }

    const json = (await res.json().catch(() => ({}))) as { id?: string }
    logger.info('receipt.sent', { reference: order.reference })
    return { sent: true, providerId: json.id ?? null }
  } catch (error) {
    logger.error('receipt.send_error', {
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

// ── Rendering ────────────────────────────────────────────────────────

export function receiptText(order: NotifiableOrder): string {
  const lines: string[] = [
    'WHIPLY',
    '',
    `Receipt for order ${order.reference}`,
    order.paidAt ? `Paid ${order.paidAt.toISOString()}` : '',
    '',
    'ITEMS',
  ]

  for (const item of order.items) {
    lines.push(
      `  ${item.quantity} × ${item.nameAtPurchase} (${item.skuAtPurchase})` +
        `  ${formatSgd(cents(item.lineTotalCents), { alwaysCents: true })}`,
    )
  }

  lines.push('')
  for (const row of totalsRows(order)) lines.push(`  ${row.label}: ${row.value}`)

  lines.push('', 'DELIVERY', `  ${methodLabel(order.deliveryMethod)}`, `  ${slotLabel(order)}`, '')
  for (const line of addressLines(order)) lines.push(`  ${line}`)
  if (order.instructions) lines.push(`  Particulars: ${order.instructions}`)

  lines.push(
    '',
    `Contact: ${order.contactPhone}`,
    '',
    'Paid by PayNow via Stripe. This email is your receipt.',
    'Questions? Reply to this email and quote your order reference.',
  )

  return lines.filter((l) => l !== undefined).join('\n')
}

export function receiptHtml(order: NotifiableOrder): string {
  const itemRows = order.items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #E5E3DC;">
            <div style="font-size:14px;color:#17181A;">${esc(item.nameAtPurchase)}</div>
            <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:0.06em;color:#6B6D66;text-transform:uppercase;">
              ${esc(item.skuAtPurchase)} · ${item.quantity} × ${formatSgd(cents(item.unitPriceCents), { alwaysCents: true })}
            </div>
          </td>
          <td align="right" style="padding:10px 0;border-bottom:1px solid #E5E3DC;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;color:#17181A;white-space:nowrap;">
            ${formatSgd(cents(item.lineTotalCents), { alwaysCents: true })}
          </td>
        </tr>`,
    )
    .join('')

  const totals = totalsRows(order)
  const totalRows = totals
    .map((row, index) => {
      const last = index === totals.length - 1
      return `
        <tr>
          <td style="padding:${last ? '12px 0 0' : '4px 0'};font-size:${last ? '14px' : '13px'};color:${last ? '#17181A' : '#6B6D66'};${last ? 'font-weight:600;border-top:1px solid #17181A;' : ''}">
            ${esc(row.label)}
          </td>
          <td align="right" style="padding:${last ? '12px 0 0' : '4px 0'};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:${last ? '15px' : '13px'};color:#17181A;${last ? 'font-weight:600;border-top:1px solid #17181A;' : ''}">
            ${esc(row.value)}
          </td>
        </tr>`
    })
    .join('')

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F6F2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F2;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #17181A;">
        <tr><td style="padding:28px 28px 20px;border-bottom:1px solid #17181A;">
          <div style="font-size:24px;letter-spacing:-0.03em;font-weight:600;color:#17181A;">WHIPLY</div>
          <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6B6D66;margin-top:6px;">
            Receipt · ${esc(order.reference)}
          </div>
        </td></tr>

        <tr><td style="padding:24px 28px 8px;">
          <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6B6D66;padding-bottom:8px;">Items</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemRows}</table>
        </td></tr>

        <tr><td style="padding:16px 28px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${totalRows}</table>
        </td></tr>

        <tr><td style="padding:20px 28px;border-top:1px solid #E5E3DC;">
          <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6B6D66;padding-bottom:8px;">Delivery</div>
          <div style="font-size:14px;color:#17181A;line-height:1.6;">
            ${esc(methodLabel(order.deliveryMethod))}<br>
            <strong>${esc(slotLabel(order))}</strong>
          </div>
          <div style="font-size:14px;color:#34362F;line-height:1.6;margin-top:12px;">
            ${addressLines(order).map(esc).join('<br>')}
          </div>
          ${
            order.instructions
              ? `<div style="font-size:13px;color:#6B6D66;line-height:1.6;margin-top:10px;">Particulars: ${esc(order.instructions)}</div>`
              : ''
          }
          <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#6B6D66;margin-top:12px;">${esc(order.contactPhone)}</div>
        </td></tr>

        <tr><td style="padding:18px 28px 26px;border-top:1px solid #E5E3DC;">
          <div style="font-size:12px;color:#6B6D66;line-height:1.6;">
            Paid by PayNow via Stripe. This email is your receipt — keep it for your records.
            Reply to this email and quote <strong>${esc(order.reference)}</strong> if anything is wrong.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
