'use client'

import { useState, useTransition } from 'react'
import { createDiscountAction } from '@/lib/admin/actions'
import { Field, Input } from '@/components/ui/field'

export function DiscountForm() {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState(false)
  const [valueType, setValueType] = useState<'PERCENT' | 'FIXED'>('PERCENT')
  const [limitType, setLimitType] = useState<'TIME_LIMITED' | 'USE_LIMITED'>('TIME_LIMITED')

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        const formData = new FormData(form)
        setError(null)
        setCreated(false)
        start(async () => {
          const result = await createDiscountAction(formData)
          if (result.ok) {
            setCreated(true)
            form.reset()
          } else setError(result.error ?? 'Could not create.')
        })
      }}
    >
      <Field id="code" label="Code" required>
        <Input id="code" name="code" placeholder="WELCOME10" required className="figure uppercase" />
      </Field>

      <fieldset>
        <legend className="mb-2 text-[0.8125rem] font-medium text-ink">Discount</legend>
        <div className="flex gap-2">
          {(['PERCENT', 'FIXED'] as const).map((t) => (
            <label
              key={t}
              className={`flex-1 cursor-pointer border px-3 py-2 text-center text-[0.8125rem] ${
                valueType === t ? 'border-ink bg-ink text-paper' : 'border-line-strong text-body'
              }`}
            >
              <input
                type="radio"
                name="valueType"
                value={t}
                checked={valueType === t}
                onChange={() => setValueType(t)}
                className="sr-only"
              />
              {t === 'PERCENT' ? 'Percentage' : 'Fixed amount'}
            </label>
          ))}
        </div>
      </fieldset>

      {valueType === 'PERCENT' ? (
        <Field id="percentOff" label="Percent off" required>
          <Input id="percentOff" name="percentOff" inputMode="numeric" placeholder="10" required className="figure" />
        </Field>
      ) : (
        <Field id="valueSgd" label="Amount off (SGD)" required>
          <Input id="valueSgd" name="valueSgd" inputMode="decimal" placeholder="15.00" required className="figure" />
        </Field>
      )}

      <fieldset>
        <legend className="mb-2 text-[0.8125rem] font-medium text-ink">How it ends</legend>
        <div className="flex gap-2">
          {(
            [
              ['TIME_LIMITED', 'On a date'],
              ['USE_LIMITED', 'After N uses'],
            ] as const
          ).map(([t, label]) => (
            <label
              key={t}
              className={`flex-1 cursor-pointer border px-3 py-2 text-center text-[0.8125rem] ${
                limitType === t ? 'border-ink bg-ink text-paper' : 'border-line-strong text-body'
              }`}
            >
              <input
                type="radio"
                name="limitType"
                value={t}
                checked={limitType === t}
                onChange={() => setLimitType(t)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {limitType === 'TIME_LIMITED' ? (
        <Field id="expiresAt" label="Expires" required>
          <Input id="expiresAt" name="expiresAt" type="date" required />
        </Field>
      ) : (
        <Field id="maxUses" label="Maximum uses" required>
          <Input id="maxUses" name="maxUses" inputMode="numeric" placeholder="5" required className="figure" />
        </Field>
      )}

      <Field id="attributionLabel" label="Referrer" hint="Groups codes in the by-referrer report.">
        <Input id="attributionLabel" name="attributionLabel" placeholder="Jason" />
      </Field>

      {error ? (
        <p role="alert" className="mono-sm border border-[#9c3b2b]/35 px-3 py-2.5 text-[#9c3b2b]">
          {error}
        </p>
      ) : null}
      {created ? <p className="mono-sm text-[#1f5d4c]">Code created and live.</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="h-11 bg-ink text-[0.875rem] font-medium text-paper transition-colors hover:bg-body disabled:opacity-40"
      >
        {pending ? 'Creating…' : 'Create code'}
      </button>
    </form>
  )
}
