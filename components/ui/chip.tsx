import Link from 'next/link'
import { cn } from '@/lib/utils/cn'

/** The one rounded element in the system: category filter pills. */
export function Chip({
  href,
  active,
  children,
}: {
  href: string
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex h-11 items-center rounded-chip border px-5 text-[0.875rem] font-medium transition-colors',
        active
          ? 'border-ink bg-ink text-paper'
          : 'border-line-strong bg-transparent text-ink hover:border-ink',
      )}
    >
      {children}
    </Link>
  )
}
