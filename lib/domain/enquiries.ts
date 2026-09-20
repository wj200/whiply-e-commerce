import 'server-only'
import { prisma } from '@/lib/db/client'
import { normalisePhone, type EnquiryInput } from './contact'
import { sendOperatorEmail } from '@/lib/notify/operator-email'
import { logger } from '@/lib/observability/logger'
import { env } from '@/lib/config/env'

/**
 * Blueprint §8 — bulk order enquiry.
 *
 * The smallest feature in the system and the one most likely to be the first
 * to pay for itself. A trade buyer who wants forty cylinders a month should
 * not be adding them to a bag one at a time.
 */

export type EnquiryOutcome =
  | { ok: true; id: string }
  | { ok: false; reason: 'BOT' | 'RATE_LIMITED' | 'INVALID' }

export async function createEnquiry(input: {
  data: EnquiryInput
  sourcePage?: string
}): Promise<EnquiryOutcome> {
  const phone = normalisePhone(input.data.phone)
  if (!phone) return { ok: false, reason: 'INVALID' }

  const enquiry = await prisma.enquiry.create({
    data: {
      name: input.data.name,
      email: input.data.email.trim(),
      phone,
      message: input.data.message || null,
      sourcePage: input.sourcePage ?? null,
      status: 'NEW',
    },
  })

  logger.info('enquiry.received', { id: enquiry.id, sourcePage: input.sourcePage })

  // §8.4 — sent AFTER the row is committed, inside a catch that cannot fail
  // the request. An enquiry saved but unemailed is an annoyance; an enquiry
  // lost because a mail provider was down is a lost customer.
  void notifyOperator(enquiry.id, input.data, phone).catch(() => {})

  return { ok: true, id: enquiry.id }
}

async function notifyOperator(
  id: string,
  data: EnquiryInput,
  phone: string,
): Promise<void> {
  const site = env().NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  await sendOperatorEmail({
    subject: `WHIPLY bulk enquiry — ${data.name}`,
    text: [
      `A new bulk order enquiry has come in.`,
      ``,
      `Name:    ${data.name}`,
      `Phone:   ${phone}`,
      `Email:   ${data.email.trim()}`,
      ``,
      `Message:`,
      data.message?.trim() || '(none)',
      ``,
      `Open it here: ${site}/admin/enquiries/${id}`,
    ].join('\n'),
  })
}

/**
 * §8.3 — Turnstile, verified SERVER-SIDE. The widget alone stops nothing.
 * When no secret is configured (local development) verification is skipped
 * and that fact is logged, so it can never silently pass in production.
 */
export async function verifyTurnstile(token: string | null, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      logger.critical('turnstile.not_configured_in_production')
      return false
    }
    logger.warn('turnstile.skipped_no_secret')
    return true
  }

  if (!token) return false

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return false
    const body = (await res.json()) as { success?: boolean }
    return body.success === true
  } catch {
    // A verification outage must not become an open door.
    logger.error('turnstile.verify_failed')
    return false
  }
}

export type EnquiryStatusFilter = 'NEW' | 'CONTACTED' | 'CLOSED' | 'SPAM' | 'ALL'

export async function listEnquiries(opts: { status?: EnquiryStatusFilter; limit?: number } = {}) {
  const status = opts.status && opts.status !== 'ALL' ? opts.status : undefined
  return prisma.enquiry.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: 'desc' },
    take: opts.limit ?? 200,
  })
}

export async function countNewEnquiries(): Promise<number> {
  return prisma.enquiry.count({ where: { status: 'NEW' } })
}
