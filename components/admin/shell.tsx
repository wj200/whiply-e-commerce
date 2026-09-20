import Link from 'next/link'
import { logoutAction } from '@/lib/auth/admin-actions'
import type { AdminSession } from '@/lib/auth/session'

const NAV = [
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/discounts', label: 'Discounts' },
  { href: '/admin/deliveries', label: 'Deliveries' },
  { href: '/admin/enquiries', label: 'Enquiries' },
  { href: '/admin/customers', label: 'Customers' },
  { href: '/admin/settings', label: 'Settings' },
]

export function AdminShell({
  session,
  newEnquiries,
  children,
}: {
  session: AdminSession
  newEnquiries: number
  children: React.ReactNode
}) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-pure">
        <div className="mx-auto flex h-16 max-w-[110rem] items-center justify-between gap-6 px-5 lg:px-8">
          <div className="flex items-baseline gap-3">
            <Link href="/admin/orders" className="text-[1.15rem] font-bold tracking-[-0.045em] text-ink">
              WHIPLY
            </Link>
            <span className="mono-sm text-faint">Admin</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/" className="mono-sm text-faint hover:text-ink">
              View store
            </Link>
            <span className="mono-sm hidden text-faint sm:inline">{session.email}</span>
            <form action={logoutAction}>
              <button type="submit" className="mono-sm text-muted hover:text-ink">
                Sign out
              </button>
            </form>
          </div>
        </div>

        <nav aria-label="Admin sections" className="border-t border-line">
          <ul className="mx-auto flex max-w-[110rem] gap-1 overflow-x-auto px-3 lg:px-6">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex items-center gap-2 whitespace-nowrap px-3 py-3 text-[0.875rem] text-body transition-colors hover:text-ink"
                >
                  {item.label}
                  {item.href === '/admin/enquiries' && newEnquiries > 0 ? (
                    <span className="figure inline-flex h-5 min-w-5 items-center justify-center rounded-chip bg-ink px-1.5 text-[0.6875rem] text-paper">
                      {newEnquiries}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-[110rem] px-5 py-8 lg:px-8">{children}</main>
    </div>
  )
}

export function PageTitle({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: React.ReactNode
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="display-sm text-[1.75rem]">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-[0.9375rem] text-muted">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  )
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`border border-line bg-pure ${className ?? ''}`}>{children}</div>
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mono border border-line bg-pure py-16 text-center text-faint">{children}</p>
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`mono-sm border-b border-line px-4 py-3 text-left text-faint ${className ?? ''}`}>
      {children}
    </th>
  )
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <td className={`border-b border-line px-4 py-3 align-top text-[0.875rem] ${className ?? ''}`}>
      {children}
    </td>
  )
}
