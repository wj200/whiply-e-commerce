'use client'

import Script from 'next/script'
import { useRef, useState } from 'react'
import { Field, Input, Textarea } from '@/components/ui/field'
import { ArrowUpRight } from '@/components/ui/arrow'

type FieldErrors = Partial<Record<string, string>>

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void }) => string
      reset: (id?: string) => void
    }
  }
}

export function BulkEnquiryForm({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const tokenRef = useRef<string | null>(null)
  const widgetRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  function mountTurnstile() {
    if (!turnstileSiteKey || !widgetRef.current || !window.turnstile) return
    if (widgetIdRef.current) return
    widgetIdRef.current = window.turnstile.render(widgetRef.current, {
      sitekey: turnstileSiteKey,
      callback: (token) => {
        tokenRef.current = token
      },
    })
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const form = new FormData(event.currentTarget)
    setSubmitting(true)
    setFormError(null)
    setErrors({})

    try {
      const res = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          email: String(form.get('email') ?? ''),
          phone: String(form.get('phone') ?? ''),
          message: String(form.get('message') ?? ''),
          company: String(form.get('company') ?? ''),
          turnstileToken: tokenRef.current,
        }),
      })

      const body = (await res.json()) as {
        ok?: boolean
        error?: string
        issues?: { path: string; message: string }[]
      }

      if (!res.ok) {
        if (body.issues?.length) {
          const next: FieldErrors = {}
          for (const issue of body.issues) if (!next[issue.path]) next[issue.path] = issue.message
          setErrors(next)
        }
        setFormError(body.error ?? 'Something went wrong. Please try again.')
        if (window.turnstile && widgetIdRef.current) window.turnstile.reset(widgetIdRef.current)
        tokenRef.current = null
        setSubmitting(false)
        return
      }

      setSent(true)
    } catch {
      setFormError('We could not reach the server. Please try again.')
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <div role="status" className="border border-line-strong bg-veil px-6 py-10 text-center">
        <p className="mono text-faint">Received</p>
        <p className="display-sm mt-4 text-[1.375rem]">Thanks. We&apos;ll be in touch shortly.</p>
        <p className="mt-3 text-[0.9375rem] text-muted">
          A person reads every enquiry. You will not receive an automated quote.
        </p>
      </div>
    )
  }

  return (
    <>
      {turnstileSiteKey ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="lazyOnload"
          onLoad={mountTurnstile}
        />
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <Field id="bulk-name" label="Name" required error={errors.name}>
          <Input id="bulk-name" name="name" autoComplete="name" required aria-invalid={!!errors.name} />
        </Field>

        <Field id="bulk-phone" label="Mobile number" required error={errors.phone}>
          <Input
            id="bulk-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="9123 4567"
            required
            aria-invalid={!!errors.phone}
          />
        </Field>

        <Field id="bulk-email" label="Email" required error={errors.email}>
          <Input
            id="bulk-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            aria-invalid={!!errors.email}
          />
        </Field>

        <Field
          id="bulk-message"
          label="What do you need?"
          error={errors.message}
          hint="Roughly what, and roughly how often. Optional — we just need to reach you."
        >
          <Textarea id="bulk-message" name="message" maxLength={1000} rows={4} />
        </Field>

        {/* Honeypot. Hidden from people, irresistible to naive bots. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="bulk-company">Company (leave blank)</label>
          <input id="bulk-company" name="company" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        {turnstileSiteKey ? <div ref={widgetRef} className="min-h-[65px]" /> : null}

        {formError ? (
          <p role="alert" className="mono-sm border border-[#9c3b2b]/35 px-3 py-2.5 text-[#9c3b2b]">
            {formError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="flex h-[3.5rem] w-full items-center justify-between bg-ink px-6 text-[0.9375rem] font-medium text-paper transition-colors hover:bg-body disabled:opacity-40"
        >
          {submitting ? 'Sending…' : 'Send enquiry'}
          <ArrowUpRight />
        </button>

        <p className="text-[0.75rem] leading-relaxed text-muted">
          We use these details only to contact you about this enquiry. No marketing, no mailing
          list, no sharing.
        </p>
      </form>
    </>
  )
}
