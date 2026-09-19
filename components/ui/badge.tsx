import { cn } from '@/lib/utils/cn'

type Tone = 'neutral' | 'success' | 'warn' | 'danger' | 'ink'

const tones: Record<Tone, string> = {
  neutral: 'border-line-strong text-muted',
  success: 'border-[#1f5d4c]/35 text-[#1f5d4c]',
  warn: 'border-[#8a6410]/35 text-[#8a6410]',
  danger: 'border-[#9c3b2b]/35 text-[#9c3b2b]',
  ink: 'border-ink bg-ink text-paper',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={cn('mono-sm inline-flex border px-2.5 py-1', tones[tone], className)}>
      {children}
    </span>
  )
}
