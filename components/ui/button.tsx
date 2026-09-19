import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'
import { ArrowUpRight } from './arrow'

/**
 * Buttons are SHARP RECTANGLES. No radius anywhere in this system except
 * filter chips and the circular arrow discs.
 */
type Variant = 'primary' | 'secondary' | 'onDark' | 'quiet'
type Size = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-between gap-6 font-medium transition-colors duration-150 ' +
  'disabled:cursor-not-allowed disabled:opacity-40'

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-paper hover:bg-body',
  secondary: 'border border-line-strong bg-transparent text-ink hover:border-ink',
  onDark: 'bg-paper text-ink hover:bg-white',
  quiet: 'bg-veil text-ink hover:bg-frame',
}

const sizes: Record<Size, string> = {
  sm: 'h-10 px-4 text-[0.8125rem]',
  md: 'h-12 px-5 text-[0.875rem]',
  lg: 'h-[3.75rem] px-6 text-[0.9375rem]',
}

export function buttonClasses(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return cn(base, variants[variant], sizes[size], extra)
}

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant
    size?: Size
    arrow?: boolean
  }
>(function Button({ variant = 'primary', size = 'md', arrow, className, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={buttonClasses(variant, size, cn(arrow ? '' : 'justify-center gap-2', className))}
      {...props}
    >
      {children}
      {arrow ? <ArrowUpRight /> : null}
    </button>
  )
})

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  arrow,
  className,
  href,
  children,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size; arrow?: boolean }) {
  return (
    <Link
      href={href}
      className={buttonClasses(variant, size, cn(arrow ? '' : 'justify-center gap-2', className))}
      {...props}
    >
      {children}
      {arrow ? <ArrowUpRight /> : null}
    </Link>
  )
}
