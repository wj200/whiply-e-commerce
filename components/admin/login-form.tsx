'use client'

import { useActionState } from 'react'
import { loginAction, type LoginState } from '@/lib/auth/admin-actions'
import { Field, Input } from '@/components/ui/field'

const INITIAL: LoginState = { error: null }

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, INITIAL)

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />

      <Field id="email" label="Email" required>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </Field>

      <Field id="password" label="Password" required>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>

      <Field id="totp" label="Authenticator code" required>
        <Input
          id="totp"
          name="totp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          placeholder="000000"
          required
          className="figure tracking-[0.3em]"
        />
      </Field>

      {state.error ? (
        <p role="alert" className="mono-sm border border-[#9c3b2b]/35 px-3 py-2.5 text-[#9c3b2b]">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-[3.25rem] bg-ink text-[0.9375rem] font-medium text-paper transition-colors hover:bg-body disabled:opacity-40"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
