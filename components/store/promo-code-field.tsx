'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { inputClasses } from '@/components/ui/field'

export function PromoCodeField({
  appliedCode,
  codeError,
  onApply,
  onRemove,
  disabled,
}: {
  appliedCode: string | null
  codeError: string | null
  onApply: (code: string) => void
  onRemove: () => void
  disabled?: boolean
}) {
  const [value, setValue] = useState('')

  if (appliedCode) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-success/30 bg-success-soft px-3 py-2.5">
        <p className="text-sm font-semibold text-success">
          Code <span className="font-mono">{appliedCode}</span> applied
        </p>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs font-semibold text-success underline underline-offset-2 hover:no-underline"
        >
          Remove
        </button>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (value.trim()) onApply(value.trim())
      }}
    >
      <label htmlFor="promo" className="text-sm font-semibold text-ink">
        Promo or referral code
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id="promo"
          name="promo"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="e.g. WELCOME10"
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={codeError ? true : undefined}
          aria-describedby={codeError ? 'promo-error' : undefined}
          className={`${inputClasses} font-mono uppercase`}
        />
        <Button type="submit" variant="secondary" disabled={disabled || !value.trim()}>
          Apply
        </Button>
      </div>
      {codeError ? (
        <p id="promo-error" role="alert" className="mt-1.5 text-xs font-medium text-danger">
          {codeError}
        </p>
      ) : null}
    </form>
  )
}
