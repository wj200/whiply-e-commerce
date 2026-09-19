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
    const { pruneWebhookEvents } = await import('@/lib/jobs/prune-webhooks')
    const pruned = await pruneWebhookEvents()
    logger.info('cron.prune_webhooks.done', { pruned, ms: Date.now() - startedAt })
    return NextResponse.json({ ok: true, pruned })
  } catch (error) {
    logger.error('cron.prune-webhooks.failed', {
      message: error instanceof Error ? error.message : 'unknown',
    })
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
