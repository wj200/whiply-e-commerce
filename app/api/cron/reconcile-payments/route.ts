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
    const { reconcilePayments } = await import('@/lib/jobs/reconcile-payments')
    const result = await reconcilePayments()
    logger.info('cron.reconcile_payments.done', { ...result, ms: Date.now() - startedAt })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    logger.error('cron.reconcile-payments.failed', {
      message: error instanceof Error ? error.message : 'unknown',
    })
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
