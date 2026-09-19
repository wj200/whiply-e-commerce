'use client'

import { MAX_QTY_PER_LINE } from '@/lib/cart/types'

export function QuantityStepper({
  value,
  onChange,
  disabled = false,
  label,
  size = 'md',
}: {
  value: number
  onChange: (next: number) => void
  disabled?: boolean
  label: string
  size?: 'sm' | 'md'
}) {
  const h = size === 'sm' ? 'h-9' : 'h-11'
  const w = size === 'sm' ? 'w-9' : 'w-11'

  function clamp(n: number) {
    if (!Number.isFinite(n)) return 1
    return Math.min(Math.max(Math.floor(n), 1), MAX_QTY_PER_LINE)
  }

  return (
    <div
      className={`flex ${h} items-stretch overflow-hidden rounded-[var(--radius-control)] border border-line`}
    >
      <button
        type="button"
        disabled={disabled || value <= 1}
        onClick={() => onChange(clamp(value - 1))}
        aria-label={`Decrease ${label}`}
        className={`${w} shrink-0 text-lg font-semibold text-ink transition-colors hover:bg-shell disabled:opacity-35`}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_QTY_PER_LINE}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="w-full min-w-0 border-x border-line bg-white text-center text-[0.95rem] font-semibold text-ink tnum focus:outline-none disabled:bg-shell [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        disabled={disabled || value >= MAX_QTY_PER_LINE}
        onClick={() => onChange(clamp(value + 1))}
        aria-label={`Increase ${label}`}
        className={`${w} shrink-0 text-lg font-semibold text-ink transition-colors hover:bg-shell disabled:opacity-35`}
      >
        +
      </button>
    </div>
  )
}
