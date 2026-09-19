import Link from 'next/link'
import { cn } from '@/lib/utils/cn'

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="WHIPLY — home"
      className={cn(
        'font-display text-2xl font-bold tracking-tight text-ink transition-colors hover:text-accent',
        className,
      )}
    >
      WHIPLY
    </Link>
  )
}
