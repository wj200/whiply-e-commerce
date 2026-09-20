import { redirect } from 'next/navigation'
import { currentSession } from '@/lib/auth/session'
import { countNewEnquiries } from '@/lib/domain/enquiries'
import { AdminShell } from '@/components/admin/shell'

export const dynamic = 'force-dynamic'

/**
 * THE ENFORCEMENT POINT (§9.1).
 *
 * Middleware only checks that a cookie is PRESENT — it runs on the edge
 * runtime where the signature cannot be verified. Here, on Node, the session
 * is verified for real. Every server action verifies again independently, so
 * a forged cookie reaches nothing.
 *
 * /admin/login sits outside this route group precisely so it does not
 * inherit this check.
 */
export default async function AuthedAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession()
  if (!session) redirect('/admin/login')

  const newEnquiries = await countNewEnquiries()

  return (
    <AdminShell session={session} newEnquiries={newEnquiries}>
      {children}
    </AdminShell>
  )
}
