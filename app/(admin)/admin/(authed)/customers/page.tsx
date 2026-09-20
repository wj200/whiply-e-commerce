import type { Metadata } from 'next'
import { derivedCustomers } from '@/lib/domain/admin-orders'
import { PageTitle, Card, Th, Td, Empty } from '@/components/admin/shell'
import { formatSgd, cents } from '@/lib/money'

export const metadata: Metadata = { title: 'Customers' }
export const dynamic = 'force-dynamic'

export default async function CustomersPage() {
  const customers = await derivedCustomers()

  return (
    <>
      <PageTitle
        title="Customers"
        subtitle="A view over orders, not a table. There are no accounts, so there is nothing stored here."
      />

      <div className="mb-5 border-l-2 border-line-strong bg-veil px-4 py-3">
        <p className="mono text-muted">Not a mailing list</p>
        <p className="mt-1.5 text-[0.875rem] leading-relaxed text-body">
          This is grouped from order records so you can answer “has this person ordered before?”.
          WHIPLY sends no marketing, and there is no export that turns this into a list.
        </p>
      </div>

      {customers.length === 0 ? (
        <Empty>No orders yet.</Empty>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[52rem]">
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Contact</Th>
                <Th>Orders</Th>
                <Th>Lifetime value</Th>
                <Th>Codes used</Th>
                <Th>Last order</Th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.email} className="hover:bg-veil">
                  <Td className="text-ink">{c.name}</Td>
                  <Td>
                    <p className="figure text-[0.8125rem] text-body">{c.phone}</p>
                    <p className="text-[0.8125rem] text-muted">{c.email}</p>
                  </Td>
                  <Td className="figure">{c.orderCount}</Td>
                  <Td className="figure text-ink">
                    {formatSgd(cents(c.lifetimeValueCents), { alwaysCents: true })}
                  </Td>
                  <Td className="figure text-muted">
                    {c.codesUsed.length ? c.codesUsed.join(', ') : '—'}
                  </Td>
                  <Td className="mono-sm text-faint">
                    {c.lastOrderAt.toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore' })}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}
