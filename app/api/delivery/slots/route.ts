import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSlotRules } from '@/lib/domain/settings'
import { availableSlots, orderingWindow, sgtDateKey } from '@/lib/domain/delivery-slots'
import { rateLimit } from '@/lib/ratelimit'
import { clientIp } from '@/lib/http/ip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.enum(['STANDARD', 'EXPRESS'])

/**
 * Blueprint §7.2 — the slots the picker renders.
 *
 * Read-only, and deliberately not cached: an express slot list is accurate
 * for minutes. The server regenerates and re-checks the chosen slot at
 * checkout anyway (GUARD-1), so a stale list costs the customer a retry,
 * never a bad booking.
 */
export async function GET(request: Request) {
  const limited = await rateLimit(`slots:${clientIp(request)}`, { limit: 60, windowSec: 60 })
  if (!limited.ok) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })

  const url = new URL(request.url)
  const parsed = querySchema.safeParse(url.searchParams.get('method') ?? 'STANDARD')
  if (!parsed.success) {
    return NextResponse.json({ error: 'Unknown delivery method.' }, { status: 400 })
  }

  const now = new Date()
  const rules = await getSlotRules()
  const window = orderingWindow(now, rules)
  const slots = window.open ? availableSlots({ method: parsed.data, now, rules }) : []

  // Grouped by SGT day, because that is how the picker reads.
  const days = new Map<string, { start: string; end: string; label: string }[]>()
  for (const slot of slots) {
    const key = sgtDateKey(slot.start)
    const bucket = days.get(key) ?? []
    bucket.push({ start: slot.start.toISOString(), end: slot.end.toISOString(), label: slot.label })
    days.set(key, bucket)
  }

  return NextResponse.json({
    method: parsed.data,
    orderingOpen: window.open,
    closedMessage: window.open ? null : window.message,
    leadMinutes: rules.leadMinutes,
    days: [...days.entries()].map(([dateKey, entries]) => ({ dateKey, slots: entries })),
  })
}
