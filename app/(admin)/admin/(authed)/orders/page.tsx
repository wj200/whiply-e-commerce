import Link from 'next/link'
import type { Metadata } from 'next'
import { listOrders, orderCounts, ORDER_TABS } from '@/lib/domain/admin-orders'
import { ORDER_STATUS_LABEL } from '@/lib/domain/state-machine'
import { PageTitle, Card, Empty, Th, Td } from '@/components/admin/shell'
import { formatSgd, cents } from '@/lib/money'
import type { OrderStatus } from '@/lib/generated/prisma'

export const metadata: Metadata = { title: 'Orders' }
export const dynamic = 'force-dynamic'

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  const { status, q } = await searchParams
  const active = (status ?? 'ALL') as OrderStatus | 'ALL'

  const [orders, counts] = await Promise.all([
    listOrders({ status: active, q }),
    orderCounts(),
  ])

  return (
    <>
      <PageTitle
        title="Orders"
        subtitle="Every order, newest first."
        right={
          <form className="flex gap-2">
            {active !== 'ALL' ? <input type="hidden" name="status" value={active} /> : null}
            <input
              name="q"
              defaultValue={q ?? ''}
              placeholder="Reference, name, email, phone"
              className="h-10 w-64 border border-line-strong bg-pure px-3 text-[0.875rem] focus:border-ink focus:outline-none"
            />
            <button className="h-10 border border-line-strong px-4 text-[0.8125rem] font-medium hover:border-ink">
              Search
            </button>
          </form>
        }
      />

      <nav aria-label="Filter by status" className="mb-5 flex flex-wrap gap-2">
        {ORDER_TABS.map((tab) => {
          const count = counts[tab.key] ?? 0
          const isActive = active === tab.key
          return (
            <Link
              key={tab.key}
              href={`/admin/orders${tab.key === 'ALL' ? '' : `?status=${tab.key}`}`}
              className={`inline-flex items-center gap-2 rounded-chip border px-3.5 py-1.5 text-[0.8125rem] transition-colors ${
                isActive
                  ? 'border-ink bg-ink text-paper'
                  : 'border-line-strong text-body hover:border-ink'
              }`}
            >
              {tab.label}
              <span className="figure opacity-60">{count}</span>
            </Link>
          )
        })}
      </nav>

      {orders.length === 0 ? (
        <Empty>No orders here.</Empty>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[60rem]">
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Placed</Th>
                <Th>Customer</Th>
                <Th>Items</Th>
                <Th>Total</Th>
                <Th>Order</Th>
                <Th>Payment</Th>
                <Th>Delivery</Th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-veil">
                  <Td>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="figure font-medium text-ink underline underline-offset-4"
                    >
                      {order.reference}
                    </Link>
                  </Td>
                  <Td className="mono-sm text-faint">
                    {order.createdAt.toLocaleString('en-SG', {
                      timeZone: 'Asia/Singapore',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </Td>
                  <Td>
                    <p className="text-ink">{order.contactName}</p>
                    <p className="mono-sm text-faint">{order.postalCode}</p>
                  </Td>
                  <Td className="figure">{order.items.reduce((n, i) => n + i.quantity, 0)}</Td>
                  <Td className="figure text-ink">
                    {formatSgd(cents(order.totalCents), { alwaysCents: true })}
                  </Td>
                  <Td>
                    <StatusPill status={order.orderStatus} />
                  </Td>
                  <Td className="mono-sm text-muted">{order.payment?.paymentStatus ?? '—'}</Td>
                  <Td className="mono-sm text-muted">{order.delivery?.deliveryStatus ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}

function StatusPill({ status }: { status: OrderStatus }) {
  const tone =
    status === 'DELIVERED'
      ? 'border-[#1f5d4c]/35 text-[#1f5d4c]'
      : status === 'REVIEW'
        ? 'border-[#9c3b2b]/40 text-[#9c3b2b]'
        : status === 'CANCELLED' || status === 'REFUNDED'
          ? 'border-line-strong text-faint'
          : 'border-line-strong text-ink'
  return (
    <span className={`mono-sm inline-block whitespace-nowrap border px-2 py-1 ${tone}`}>
      {ORDER_STATUS_LABEL[status]}
    </span>
  )
}
