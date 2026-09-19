import 'server-only'
import type { Prisma } from '@/lib/db/client'
import { prisma } from '@/lib/db/client'

/**
 * Blueprint §5.6–5.7 — redemption counting and referral attribution.
 *
 * The counter is incremented CONDITIONALLY, inside the payment transaction,
 * with the condition enforced by the database rather than by a prior read.
 * That is what makes "one use left, two simultaneous checkouts" produce
 * exactly one increment instead of two.
 */

export type RedemptionOutcome =
  | { counted: true }
  | { counted: false; reason: 'EXHAUSTED' }

export async function countRedemption(
  tx: Prisma.TransactionClient,
  input: {
    codeId: string
    orderId: string
    discountCents: number
    orderTotalCents: number
  },
): Promise<RedemptionOutcome> {
  // Conditional increment. 0 rows means the code ran out while this customer
  // was paying — we still honour the price they were quoted and charged,
  // because refusing a payment HitPay has already captured is the worse
  // failure. The over-redemption is recorded and surfaced to the operator.
  const updated = await tx.$executeRaw`
    UPDATE discount_codes
       SET uses_count = uses_count + 1,
           updated_at = now()
     WHERE id = ${input.codeId}::uuid
       AND (limit_type <> 'USE_LIMITED' OR uses_count < max_uses)
  `

  // The redemption row is written either way: reporting (§9.4) reads this
  // table, not the counter, so an over-redemption is still visible revenue.
  await tx.discountRedemption.create({
    data: {
      codeId: input.codeId,
      orderId: input.orderId,
      discountCents: input.discountCents,
      orderTotalCents: input.orderTotalCents,
    },
  })

  return updated === 0 ? { counted: false, reason: 'EXHAUSTED' } : { counted: true }
}

export type CodePerformance = {
  codeId: string
  code: string
  attributionLabel: string | null
  redemptions: number
  salesGeneratedCents: number
  discountGivenCents: number
}

/**
 * §9.4 reporting — read from redemption ROWS, not from a counter, which is
 * why `discount_redemptions` exists at all. Adding a commission model later
 * is then a calculation over data that was captured from day one (§5.7).
 */
export async function codePerformance(): Promise<CodePerformance[]> {
  const grouped = await prisma.discountRedemption.groupBy({
    by: ['codeId'],
    _count: { _all: true },
    _sum: { discountCents: true, orderTotalCents: true },
  })

  if (grouped.length === 0) return []

  const codes = await prisma.discountCode.findMany({
    where: { id: { in: grouped.map((g) => g.codeId) } },
    select: { id: true, code: true, attributionLabel: true },
  })
  const byId = new Map(codes.map((c) => [c.id, c]))

  return grouped
    .map((g) => {
      const meta = byId.get(g.codeId)
      return {
        codeId: g.codeId,
        code: meta?.code ?? '(deleted)',
        attributionLabel: meta?.attributionLabel ?? null,
        redemptions: g._count._all,
        salesGeneratedCents: g._sum.orderTotalCents ?? 0,
        discountGivenCents: g._sum.discountCents ?? 0,
      }
    })
    .sort((a, b) => b.salesGeneratedCents - a.salesGeneratedCents)
}

/** Per-referrer rollup, grouping codes that share an attribution label. */
export async function referrerPerformance(): Promise<
  { label: string; codes: string[]; redemptions: number; salesCents: number; discountCents: number }[]
> {
  const perCode = await codePerformance()
  const byLabel = new Map<
    string,
    { label: string; codes: string[]; redemptions: number; salesCents: number; discountCents: number }
  >()

  for (const row of perCode) {
    if (!row.attributionLabel) continue
    const existing = byLabel.get(row.attributionLabel) ?? {
      label: row.attributionLabel,
      codes: [],
      redemptions: 0,
      salesCents: 0,
      discountCents: 0,
    }
    existing.codes.push(row.code)
    existing.redemptions += row.redemptions
    existing.salesCents += row.salesGeneratedCents
    existing.discountCents += row.discountGivenCents
    byLabel.set(row.attributionLabel, existing)
  }

  return [...byLabel.values()].sort((a, b) => b.salesCents - a.salesCents)
}
