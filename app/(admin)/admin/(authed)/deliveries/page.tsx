import Link from 'next/link'
import type { Metadata } from 'next'
import { listDeliveries, deliveryCostSummary } from '@/lib/domain/delivery-reporting'
import { PageTitle, Card, Th, Td, Empty } from '@/components/admin/shell'
import { formatSgd, cents } from '@/lib/money'
import { formatSlotWithDate } from '@/lib/domain/delivery-slots'
import { DELIVERY_STATUS_LABEL } from '@/lib/domain/fulfilment'

export const metadata: Metadata = { title: 'Deliveries' }
export const dynamic = 'force-dynamic'

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const [rows, summary] = await Promise.all([
    listDeliveries({ status }),
    deliveryCostSummary(),
  ])

  const subsidised = summary.marginCents < 0

  return (
    <>
      <PageTitle
        title="Deliveries"
        subtitle="The run sheet, in slot order — and what each delivery cost against what it charged."
        right={
          <Link
            href="/api/admin/deliveries.csv"
            className="mono-sm border border-line-strong px-4 py-2.5 text-ink hover:border-ink"
          >
            Export CSV
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Runs completed" value={String(summary.deliveries)} />
        <Stat
          label="Fees collected"
          value={formatSgd(cents(summary.feesCollectedCents), { alwaysCents: true })}
        />
        <Stat
          label="Delivery cost"
          value={formatSgd(cents(summary.actualCostCents), { alwaysCents: true })}
          note={
            summary.uncostedCount > 0
              ? `${summary.uncostedCount} run${summary.uncostedCount === 1 ? '' : 's'} with no cost entered`
              : undefined
          }
        />
        <Stat
          label="Delivery margin"
          value={formatSgd(cents(summary.marginCents), { alwaysCents: true })}
          tone={subsidised ? 'bad' : 'good'}
          note={
            summary.freeDeliveryCount > 0
              ? `${summary.freeDeliveryCount} free delivery${
                  summary.freeDeliveryCount === 1 ? '' : 'ies'
                } cost ${formatSgd(cents(summary.freeDeliveryCostCents), { alwaysCents: true })}`
              : undefined
          }
        />
      </div>

      {rows.length === 0 ? (
        <Empty>No deliveries yet.</Empty>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[64rem]">
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Status</Th>
                <Th>Speed</Th>
                <Th>Slot</Th>
                <Th>To</Th>
                <Th>Charged</Th>
                <Th>Cost</Th>
                <Th>Margin</Th>
                <Th>Carried by</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const cost = row.actualCostCents
                const margin = cost === null ? null : row.feeChargedCents - cost
                return (
                  <tr key={row.orderId} className="hover:bg-veil">
                    <Td>
                      <Link
                        href={`/admin/orders/${row.orderId}`}
                        className="figure text-ink underline underline-offset-4"
                      >
                        {row.reference}
                      </Link>
                    </Td>
                    <Td className="mono-sm text-muted">
                      {DELIVERY_STATUS_LABEL[row.deliveryStatus as keyof typeof DELIVERY_STATUS_LABEL] ??
                        row.deliveryStatus}
                    </Td>
                    <Td className="mono-sm text-muted">{row.deliveryMethod}</Td>
                    <Td className="figure text-[0.8125rem] text-muted">
                      {row.slotStart && row.slotEnd
                        ? formatSlotWithDate({ start: row.slotStart, end: row.slotEnd })
                        : '—'}
                    </Td>
                    <Td className="figure text-muted">{row.postalCode}</Td>
                    <Td className="figure text-ink">
                      {formatSgd(cents(row.feeChargedCents), { alwaysCents: true })}
                    </Td>
                    <Td className="figure text-muted">
                      {cost === null ? '—' : formatSgd(cents(cost), { alwaysCents: true })}
                    </Td>
                    <Td
                      className={`figure ${
                        margin === null ? 'text-faint' : margin < 0 ? 'text-[#9c3b2b]' : 'text-[#1f5d4c]'
                      }`}
                    >
                      {margin === null ? '—' : formatSgd(cents(margin), { alwaysCents: true })}
                    </Td>
                    <Td className="text-muted">{row.courierRef ?? '—'}</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}

function Stat({
  label,
  value,
  tone,
  note,
}: {
  label: string
  value: string
  tone?: 'good' | 'bad'
  note?: string
}) {
  return (
    <div className="border border-line bg-pure px-5 py-4">
      <p className="mono-sm text-faint">{label}</p>
      <p
        className={`figure mt-2 text-[1.5rem] font-semibold ${
          tone === 'bad' ? 'text-[#9c3b2b]' : tone === 'good' ? 'text-[#1f5d4c]' : 'text-ink'
        }`}
      >
        {value}
      </p>
      {note ? <p className="mono-sm mt-1.5 text-faint">{note}</p> : null}
    </div>
  )
}
