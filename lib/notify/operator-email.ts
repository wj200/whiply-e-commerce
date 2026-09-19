import 'server-only'
import { logger } from '@/lib/observability/logger'

/**
 * Blueprint §8.4 / §18.2 — the ONLY outbound email in the system, and it goes
 * to the OPERATOR, never to a customer.
 *
 * Customer notifications are out of scope by instruction. The `Notifier`
 * interface below is the seam left for them: adding email, SMS or WhatsApp
 * later is writing one adapter, not a refactor.
 */
export type Notifier = {
  send(input: { subject: string; text: string }): Promise<void>
}

/** The customer-facing notifier. Deliberately a no-op in v1 (§18.2). */
export const customerNotifier: Notifier = {
  async send() {
    /* no-op: no customer notification layer in v1 */
  },
}

export async function sendOperatorEmail(input: {
  subject: string
  text: string
}): Promise<{ sent: boolean }> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.OPERATOR_ALERT_EMAIL

  if (!apiKey || !to) {
    logger.warn('operator_email.not_configured', { subject: input.subject })
    return { sent: false }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.OPERATOR_EMAIL_FROM ?? 'WHIPLY <alerts@whiply.sg>',
        to: [to],
        subject: input.subject,
        text: input.text,
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      logger.error('operator_email.failed', { status: res.status, subject: input.subject })
      return { sent: false }
    }
    return { sent: true }
  } catch (error) {
    // An email failure must NEVER fail the thing that triggered it (§8.4).
    logger.error('operator_email.error', {
      subject: input.subject,
      message: error instanceof Error ? error.message : 'unknown',
    })
    return { sent: false }
  }
}
