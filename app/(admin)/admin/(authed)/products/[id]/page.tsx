import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db/client'
import { PageTitle, Card } from '@/components/admin/shell'
import { ProductForm } from '@/components/admin/product-form'

export const metadata: Metadata = { title: 'Edit product' }
export const dynamic = 'force-dynamic'

export default async function ProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = await prisma.product.findUnique({ where: { id } })
  if (!product) notFound()

  return (
    <>
      <p className="mono mb-4 text-faint">
        <Link href="/admin/products" className="hover:text-ink">
          Products
        </Link>{' '}
        / {product.sku}
      </p>

      <PageTitle title={product.name} subtitle={product.sku} />

      <Card className="max-w-3xl px-6 py-6">
        <ProductForm
          product={{
            id: product.id,
            name: product.name,
            cardLabel: product.cardLabel,
            shortDesc: product.shortDesc,
            description: product.description,
            priceCents: product.priceCents,
            stockQty: product.stockQty,
            lowStockAt: product.lowStockAt,
            isActive: product.isActive,
          }}
        />
      </Card>
    </>
  )
}
