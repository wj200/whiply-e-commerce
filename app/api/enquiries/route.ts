import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enquirySchema } from '@/lib/domain/contact'
import { createEnquiry, verifyTurnstile } from '@/lib/domain/enquiries'
import { rateLimit } from '@/lib/ratelimit'
import { clientIp } from '@/lib/http/ip'
import { logger } from '@/lib/observability/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Blueprint §8.3 — three layers, because each fails differently:
 *   1. Turnstile, verified server-side.
 *   2. A honeypot a human never fills and a naive bot always does.
 *   3. An IP rate limit.
 * A failure returns a generic error and never says which check failed.
 */
const bodySchema = enquirySchema.extend({
  turnstileToken: z.string().max(4096).nullable().optional(),
  /** Honeypot. Must stay empty. */
  company: z.string().max(200).optional(),
})

const GENERIC_ERROR = 'We could not send that. Please try again, or email us directly.'

export async function POST(request: Request) {
  const ip = clientIp(request)

  // Write path: fails CLOSED when the limiter is unavailable (§12.5).
  const perIp = await rateLimit(`enquiry:${ip}`, { limit: 3, windowSec: 3600, failClosed: true })
  if (!perIp.ok) {
    logger.warn('enquiry.rate_limited', { ip })
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 429 })
  }

  const global = await rateLimit('enquiry:global', { limit: 20, windowSec: 86_400 })
  if (!global.ok) {
    logger.warn('enquiry.global_rate_limited')
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 429 })
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Please check the details you entered.',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 400 },
    )
  }

  // Honeypot: a filled hidden field means a bot. Return 200 so it learns nothing.
  if (parsed.data.company && parsed.data.company.trim() !== '') {
    logger.warn('enquiry.honeypot_tripped', { ip })
    return NextResponse.json({ ok: true })
  }

  const human = await verifyTurnstile(parsed.data.turnstileToken ?? null, ip)
  if (!human) {
    logger.warn('enquiry.turnstile_failed', { ip })
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 })
  }

  const outcome = await createEnquiry({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      message: parsed.data.message,
    },
    sourcePage: '/bulk-orders',
  })

  if (!outcome.ok) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
