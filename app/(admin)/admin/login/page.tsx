import type { Metadata } from 'next'
import { LoginForm } from '@/components/admin/login-form'

export const metadata: Metadata = { title: 'Sign in' }
export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm">
        <p className="mono text-faint">WHIPLY admin</p>
        <h1 className="display-sm mt-4 text-[1.75rem]">Sign in.</h1>
        <p className="mt-2 text-[0.9375rem] text-muted">
          Password and authenticator code are both required.
        </p>
        <div className="mt-8">
          <LoginForm next={next ?? '/admin'} />
        </div>
      </div>
    </div>
  )
}
