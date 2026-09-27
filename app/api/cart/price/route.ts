import { NextResponse } from 'next/server'
import { z } from 'zod'
import { priceBasket } from '@/lib/domain/basket'
import { cartLineSchema, MAX_LINES } from '@/lib/cart/types'
import { rateLimit } from '@/lib/ratelimit'
import { clientIp } from '@/lib/http/ip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  lines: z.array(cartLineSchema).max(MAX_LINES),
  code: z.string().max(64).nullable().optional(),
  deliveryMethod: z.enum(['STANDARD', 'EXPRESS']).optional(),
})

/** Pure read: re-price a {sku, qty} basket. No prices are accepted. */
export async function POST(request: Request) {
  const limited = await rateLimit(`cart-price:${clientIp(request)}`, { limit: 60, windowSec: 60 })
  if (!limited.ok) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 })
  }

  const { basket, issues, codeError } = await priceBasket({
    lines: parsed.data.lines,
    codeInput: parsed.data.code ?? null,
    deliveryMethod: parsed.data.deliveryMethod,
  })

  return NextResponse.json({
    lines: basket.lines.map((l) => ({
      sku: l.sku,
      name: l.name,
      slug: l.slug,
      shortDesc: l.shortDesc,
      imageUrl: l.imageUrl,
      unitPriceCents: l.unitPriceCents,
      quantity: l.quantity,
      lineTotalCents: l.lineTotalCents,
    })),
    subtotalCents: basket.subtotalCents,
    discountCents: basket.discountCents,
    deliveryFeeCents: basket.deliveryFeeCents,
    totalCents: basket.totalCents,
    freeDeliveryApplied: basket.freeDeliveryApplied,
    amountToFreeDeliveryCents: basket.amountToFreeDeliveryCents,
    deliveryMethod: basket.deliveryMethod,
    standardDeliveryFeeCents: basket.standardDeliveryFeeCents,
    expressDeliveryFeeCents: basket.expressDeliveryFeeCents,
    freeDeliveryThresholdCents: basket.freeDeliveryThresholdCents,
    appliedCode: basket.appliedCode,
    issues,
    codeError,
  })
}
