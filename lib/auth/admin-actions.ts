'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { prisma } from '@/lib/db/client'
import { verifyPassword } from './password'
import { verifyTotp } from './totp'
import { setSessionCookie, clearSessionCookie } from './session'
import { rateLimit } from '@/lib/ratelimit'
import { recordAudit } from '@/lib/domain/audit'
import { logger } from '@/lib/observability/logger'

export type LoginState = { error: string | null }

/**
 * §9.1 — login. Rate-limited per IP AND per account, and the failure message
 * never distinguishes a wrong email from a wrong password from a wrong code.
 */
export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  const password = String(formData.get('password') ?? '')
  const totp = String(formData.get('totp') ?? '')
  const next = String(formData.get('next') ?? '/admin')

  const headerList = await headers()
  const ip = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  const GENERIC = 'Those details are not correct.'

  const byIp = await rateLimit(`admin-login:${ip}`, { limit: 10, windowSec: 900, failClosed: true })
  if (!byIp.ok) return { error: 'Too many attempts. Wait fifteen minutes and try again.' }

  if (email) {
    const byAccount = await rateLimit(`admin-login-acct:${email}`, {
      limit: 10,
      windowSec: 900,
      failClosed: true,
    })
    if (!byAccount.ok) return { error: 'Too many attempts. Wait fifteen minutes and try again.' }
  }

  const user = await prisma.adminUser.findUnique({ where: { email } })

  // Always do the work, so a missing account is not distinguishable by timing.
  const passwordOk = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, 'scrypt$16384$8$1$AAAA$AAAA')

  if (!user || !user.isActive || !passwordOk) {
    logger.warn('admin.login_failed', { ip, stage: 'password' })
    return { error: GENERIC }
  }

  // TOTP is MANDATORY. An account without an enrolled secret cannot log in.
  if (!user.totpEnrolled || !user.totpSecret) {
    logger.critical('admin.login_blocked_no_totp', { userId: user.id })
    return { error: 'This account has no authenticator enrolled. Run the admin setup script.' }
  }

  if (!verifyTotp(user.totpSecret, totp)) {
    logger.warn('admin.login_failed', { ip, stage: 'totp' })
    return { error: GENERIC }
  }

  await prisma.adminUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  await setSessionCookie({ id: user.id, email: user.email, role: user.role })
  await recordAudit({
    actorId: user.id,
    actorLabel: user.email,
    entity: 'session',
    action: 'LOGIN',
    ip,
  })
  logger.info('admin.login_ok', { userId: user.id })

  redirect(next.startsWith('/admin') ? next : '/admin')
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie()
  redirect('/admin/login')
}
