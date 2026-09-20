import type { Metadata } from 'next'
import { getAllSettings } from '@/lib/domain/settings'
import { PageTitle, Card } from '@/components/admin/shell'
import { SettingsForm } from '@/components/admin/settings-form'

export const metadata: Metadata = { title: 'Settings' }
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const settings = await getAllSettings()
  return (
    <>
      <PageTitle
        title="Settings"
        subtitle="Everything here changes the live storefront on the next request. No deploy."
      />
      <Card className="max-w-3xl px-6 py-6">
        <SettingsForm settings={settings} />
      </Card>
    </>
  )
}
