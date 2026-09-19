import { timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/config/env'

/**
 * Blueprint §11.4 — cron routes are protected by a shared secret header.
 *
 * Every job behind this is idempotent and safe to run twice, which is the
 * only property that makes a cron-driven design acceptable for work this
 * important.
 */
export function isAuthorisedCron(request: Request): boolean {
  const expected = env().CRON_SECRET
  const header =
    request.headers.get('x-cron-secret') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    ''

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(header, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
