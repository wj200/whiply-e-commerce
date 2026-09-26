import type { Metadata } from 'next'
import { prisma } from '@/lib/db/client'
import { codePerformance, referrerPerformance } from '@/lib/domain/redemptions'
import { describeCode, seasonPhase, type DiscountCodeRow } from '@/lib/domain/discounts'
import { PageTitle, Card, Th, Td } from '@/components/admin/shell'
import { ActionForm } from '@/components/admin/action-button'
import { DiscountForm } from '@/components/admin/discount-form'
import { toggleDiscountAction } from '@/lib/admin/actions'
import { formatSgd, cents } from '@/lib/money'

export const metadata: Metadata = { title: 'Discounts' }
export const dynamic = 'force-dynamic'

export default async function DiscountsPage() {
  const [codes, performance, referrers] = await Promise.all([
    prisma.discountCode.findMany({ orderBy: { createdAt: 'desc' } }),
    codePerformance(),
    referrerPerformance(),
  ])

  const perfById = new Map(performance.map((p) => [p.codeId, p]))
  const now = new Date()

  return (
    <>
      <PageTitle
        title="Discounts"
        subtitle="Two value types; limited by time, by uses, or by a season. Nothing else — by design."
      />

      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <Card className="overflow-x-auto">
            <h2 className="mono border-b border-line px-5 py-3 text-faint">Codes</h2>
            {codes.length === 0 ? (
              <p className="mono px-5 py-12 text-center text-faint">No codes yet.</p>
            ) : (
              <table className="w-full min-w-[46rem]">
                <thead>
                  <tr>
                    <Th>Code</Th>
                    <Th>Terms</Th>
                    <Th>Referrer</Th>
                    <Th>Uses</Th>
                    <Th>Sales generated</Th>
                    <Th>Discount given</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {codes.map((code) => {
                    const perf = perfById.get(code.id)
                    const row: DiscountCodeRow = {
                      id: code.id,
                      code: code.code,
                      valueType: code.valueType,
                      percentOff: code.percentOff,
                      valueCents: code.valueCents,
                      limitType: code.limitType,
                      startsAt: code.startsAt,
                      expiresAt: code.expiresAt,
                      maxUses: code.maxUses,
                      usesCount: code.usesCount,
                      attributionLabel: code.attributionLabel,
                      seasonLabel: code.seasonLabel,
                      isActive: code.isActive,
                    }
                    const phase = seasonPhase(row, now)
                    return (
                      <tr key={code.id} className="hover:bg-veil">
                        <Td>
                          <span className="figure font-medium text-ink">{code.code}</span>
                          {!code.isActive ? (
                            <span className="mono-sm ml-2 text-faint">OFF</span>
                          ) : phase === 'UPCOMING' ? (
                            <span className="mono-sm ml-2 text-muted">UPCOMING</span>
                          ) : phase === 'ENDED' ? (
                            <span className="mono-sm ml-2 text-faint">SEASON ENDED</span>
                          ) : phase === 'RUNNING' ? (
                            <span className="mono-sm ml-2 text-[#1f5d4c]">IN SEASON</span>
                          ) : null}
                        </Td>
                        <Td className="text-muted">{describeCode(row)}</Td>
                        <Td className="text-muted">{code.attributionLabel ?? '—'}</Td>
                        <Td className="figure">{perf?.redemptions ?? 0}</Td>
                        <Td className="figure text-ink">
                          {formatSgd(cents(perf?.salesGeneratedCents ?? 0), { alwaysCents: true })}
                        </Td>
                        <Td className="figure text-muted">
                          {formatSgd(cents(perf?.discountGivenCents ?? 0), { alwaysCents: true })}
                        </Td>
                        <Td>
                          <ActionForm
                            action={toggleDiscountAction}
                            label={code.isActive ? 'Disable' : 'Enable'}
                          >
                            <input type="hidden" name="id" value={code.id} />
                          </ActionForm>
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Card>

          <Card>
            <h2 className="mono border-b border-line px-5 py-3 text-faint">By referrer</h2>
            {referrers.length === 0 ? (
              <p className="mono px-5 py-10 text-center text-faint">
                No referral codes have been redeemed yet.
              </p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Referrer</Th>
                    <Th>Codes</Th>
                    <Th>Redemptions</Th>
                    <Th>Sales</Th>
                    <Th>Discount given</Th>
                  </tr>
                </thead>
                <tbody>
                  {referrers.map((r) => (
                    <tr key={r.label}>
                      <Td className="text-ink">{r.label}</Td>
                      <Td className="figure text-muted">{r.codes.join(', ')}</Td>
                      <Td className="figure">{r.redemptions}</Td>
                      <Td className="figure text-ink">
                        {formatSgd(cents(r.salesCents), { alwaysCents: true })}
                      </Td>
                      <Td className="figure text-muted">
                        {formatSgd(cents(r.discountCents), { alwaysCents: true })}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <Card className="h-fit px-5 py-5">
          <h2 className="mono mb-4 text-faint">New code</h2>
          <DiscountForm />
        </Card>
      </div>
    </>
  )
}
