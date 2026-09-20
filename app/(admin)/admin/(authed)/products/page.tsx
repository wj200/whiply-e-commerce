import Link from 'next/link'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db/client'
import { PageTitle, Card, Th, Td } from '@/components/admin/shell'
import { formatSgd, cents } from '@/lib/money'
import { CATEGORY_LABEL } from '@/lib/domain/category'

export const metadata: Metadata = { title: 'Products' }
export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  const products = await prisma.product.findMany({ orderBy: { sortOrder: 'asc' } })

  return (
    <>
      <PageTitle
        title="Products"
        subtitle="Price, stock, copy and availability — all editable without a deploy."
      />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[52rem]">
          <thead>
            <tr>
              <Th>SKU</Th>
              <Th>Name</Th>
              <Th>Category</Th>
              <Th>Price</Th>
              <Th>Stock</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const low = p.stockQty <= p.lowStockAt
              return (
                <tr key={p.id} className="hover:bg-veil">
                  <Td className="figure text-faint">{p.sku}</Td>
                  <Td className="text-ink">{p.name}</Td>
                  <Td className="text-muted">{CATEGORY_LABEL[p.category]}</Td>
                  <Td className="figure text-ink">
                    {formatSgd(cents(p.priceCents), { alwaysCents: true })}
                  </Td>
                  <Td>
                    <span className={`figure ${low ? 'text-[#9c3b2b]' : 'text-ink'}`}>
                      {p.stockQty}
                    </span>
                    {low ? <span className="mono-sm ml-2 text-[#9c3b2b]">LOW</span> : null}
                  </Td>
                  <Td>
                    <span
                      className={`mono-sm border px-2 py-1 ${
                        p.isActive
                          ? 'border-[#1f5d4c]/35 text-[#1f5d4c]'
                          : 'border-line-strong text-faint'
                      }`}
                    >
                      {p.isActive ? 'Live' : 'Hidden'}
                    </span>
                  </Td>
                  <Td>
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="mono-sm text-ink underline underline-offset-4"
                    >
                      Edit
                    </Link>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </>
  )
}
