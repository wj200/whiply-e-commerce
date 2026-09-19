import { NextResponse } from 'next/server'
import { isAuthorisedCron } from '@/lib/http/cron-auth'
import { logger } from '@/lib/observability/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const startedAt = Date.now()
  try {
    const { sweepPendingDispatches } = await import('@/lib/jobs/dispatch')
    const swept = await sweepPendingDispatches()
    logger.info('cron.dispatch.done', { swept, ms: Date.now() - startedAt })
    return NextResponse.json({ ok: true, swept })
  } catch (error) {
    logger.error('cron.dispatch.failed', {
      message: error instanceof Error ? error.message : 'unknown',
    })
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
