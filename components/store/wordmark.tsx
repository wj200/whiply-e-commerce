import Link from 'next/link'
import { cn } from '@/lib/utils/cn'

/** WHIPLY® — heavy, very tight, with a superscript registered mark. */
export function Wordmark({
  className,
  size = 'md',
  onDark = false,
}: {
  className?: string
  size?: 'md' | 'lg'
  onDark?: boolean
}) {
  const content = (
    <span className="inline-flex items-start">
      <span
        className={cn(
          'font-bold leading-none tracking-[-0.055em]',
          size === 'lg' ? 'text-[2.4rem]' : 'text-[1.6rem]',
        )}
      >
        WHIPLY
      </span>
      <span
        className={cn(
          'font-medium leading-none',
          size === 'lg' ? 'mt-1 text-[0.8rem]' : 'mt-0.5 text-[0.6rem]',
        )}
        aria-hidden="true"
      >
        ®
      </span>
    </span>
  )

  return (
    <Link
      href="/"
      aria-label="WHIPLY — home"
      className={cn(
        'inline-block transition-opacity hover:opacity-70',
        onDark ? 'text-paper' : 'text-ink',
        className,
      )}
    >
      {content}
    </Link>
  )
}
