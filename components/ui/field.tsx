import * as React from 'react'
import { cn } from '@/lib/utils/cn'

/**
 * Every field has a real <label> and, when invalid, an error tied by
 * aria-describedby (§3.7). That is not polish — it is the difference between
 * a checkout a screen-reader user can complete and one they cannot.
 */
export function Field({
  id,
  label,
  error,
  hint,
  required,
  children,
  className,
}: {
  id: string
  label: string
  error?: string | undefined
  hint?: string
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {required ? <span className="text-accent"> *</span> : null}
        {!required ? <span className="ml-1 font-normal text-faint">(optional)</span> : null}
      </label>
      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export const inputClasses =
  'h-11 w-full rounded-[var(--radius-control)] border border-line bg-white px-3 text-[0.95rem] ' +
  'text-ink placeholder:text-faint transition-colors focus:border-accent focus:outline-none ' +
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ' +
  'aria-[invalid=true]:border-danger'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(inputClasses, className)} {...props} />
  },
)

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(inputClasses, 'h-auto min-h-24 resize-y py-2.5 leading-relaxed', className)}
      {...props}
    />
  )
})
