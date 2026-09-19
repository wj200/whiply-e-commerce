import * as React from 'react'
import { cn } from '@/lib/utils/cn'

/** Every field has a real label and, when invalid, an error tied by id. */
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
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-[0.8125rem] font-medium text-ink">
        {label}
        {!required ? <span className="ml-1.5 font-normal text-faint">Optional</span> : null}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mono-sm text-[#9c3b2b]">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** Square inputs with a hairline border and an ink focus line. */
export const inputClasses =
  'h-12 w-full border border-line-strong bg-pure px-3.5 text-[0.9375rem] text-ink ' +
  'placeholder:text-faint transition-colors focus:border-ink focus:outline-none ' +
  'aria-[invalid=true]:border-[#9c3b2b]'

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
      className={cn(inputClasses, 'h-auto min-h-28 resize-y py-3 leading-relaxed', className)}
      {...props}
    />
  )
})
