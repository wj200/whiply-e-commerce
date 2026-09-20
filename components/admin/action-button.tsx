'use client'

import { useState, useTransition } from 'react'
import type { ActionResult } from '@/lib/admin/actions'

/**
 * A form that posts to a server action and surfaces the result inline.
 * Destructive actions ask for confirmation first.
 */
export function ActionForm({
  action,
  children,
  label,
  confirm,
  variant = 'secondary',
  className,
}: {
  action: (formData: FormData) => Promise<ActionResult>
  children?: React.ReactNode
  label: string
  confirm?: string
  variant?: 'primary' | 'secondary' | 'danger'
  className?: string
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const styles = {
    primary: 'bg-ink text-paper hover:bg-body',
    secondary: 'border border-line-strong text-ink hover:border-ink',
    danger: 'border border-[#9c3b2b]/40 text-[#9c3b2b] hover:bg-[#9c3b2b]/5',
  }[variant]

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault()
        if (confirm && !window.confirm(confirm)) return
        const formData = new FormData(e.currentTarget)
        setError(null)
        setDone(false)
        start(async () => {
          const result = await action(formData)
          if (result.ok) setDone(true)
          else setError(result.error ?? 'That did not work.')
        })
      }}
    >
      {children}
      <button
        type="submit"
        disabled={pending}
        className={`h-10 w-full px-4 text-[0.8125rem] font-medium transition-colors disabled:opacity-40 ${styles}`}
      >
        {pending ? 'Working…' : done ? 'Done ✓' : label}
      </button>
      {error ? (
        <p role="alert" className="mono-sm mt-2 text-[#9c3b2b]">
          {error}
        </p>
      ) : null}
    </form>
  )
}
