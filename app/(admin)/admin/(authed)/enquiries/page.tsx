import type { Metadata } from 'next'
import Link from 'next/link'
import { listEnquiries, type EnquiryStatusFilter } from '@/lib/domain/enquiries'
import { PageTitle, Card, Empty } from '@/components/admin/shell'
import { EnquiryRow } from '@/components/admin/enquiry-row'

export const metadata: Metadata = { title: 'Enquiries' }
export const dynamic = 'force-dynamic'

const TABS: { key: EnquiryStatusFilter; label: string }[] = [
  { key: 'NEW', label: 'New' },
  { key: 'CONTACTED', label: 'Contacted' },
  { key: 'CLOSED', label: 'Closed' },
  { key: 'SPAM', label: 'Spam' },
  { key: 'ALL', label: 'All' },
]

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const active = (status ?? 'NEW') as EnquiryStatusFilter
  const enquiries = await listEnquiries({ status: active })

  return (
    <>
      <PageTitle title="Bulk order enquiries" subtitle="A person reads every one. Newest first." />

      <nav className="mb-5 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/enquiries?status=${tab.key}`}
            className={`rounded-chip border px-3.5 py-1.5 text-[0.8125rem] transition-colors ${
              active === tab.key
                ? 'border-ink bg-ink text-paper'
                : 'border-line-strong text-body hover:border-ink'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {enquiries.length === 0 ? (
        <Empty>Nothing here.</Empty>
      ) : (
        <div className="space-y-4">
          {enquiries.map((enquiry) => (
            <Card key={enquiry.id}>
              <EnquiryRow
                enquiry={{
                  id: enquiry.id,
                  name: enquiry.name,
                  email: enquiry.email,
                  phone: enquiry.phone,
                  message: enquiry.message,
                  status: enquiry.status,
                  notes: enquiry.notes,
                  createdAt: enquiry.createdAt.toISOString(),
                }}
              />
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
