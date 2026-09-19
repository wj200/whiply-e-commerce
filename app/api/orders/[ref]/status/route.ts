import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { isValidReference } from '@/lib/domain/reference'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Blueprint §6.6 — the success page's poll.
 *
 * Returns STATUS ONLY. Never an address, never a phone number, never an email,
 * never the line items. The reference is a lookup key, not an assertion, and
 * this endpoint is deliberately uninteresting to anyone who guesses one.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params

  if (!isValidReference(ref)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const order = await prisma.order.findUnique({
    where: { reference: ref },
    select: {
      reference: true,
      orderStatus: true,
      payment: { select: { paymentStatus: true } },
    },
  })

  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(
    {
      reference: order.reference,
      orderStatus: order.orderStatus,
      paymentStatus: order.payment?.paymentStatus ?? 'PENDING',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
