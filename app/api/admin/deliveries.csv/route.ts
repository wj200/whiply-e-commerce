import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/session'
import { listDeliveries, deliveriesToCsv } from '@/lib/domain/delivery-reporting'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** §9.5 — exports exactly the rows shown. Admin-only, verified here. */
export async function GET(request: Request) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const url = new URL(request.url)
  const rows = await listDeliveries({
    status: url.searchParams.get('status') ?? undefined,
    limit: 5000,
  })

  return new NextResponse(deliveriesToCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="whiply-deliveries-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
