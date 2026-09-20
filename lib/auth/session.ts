import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { env } from '@/lib/config/env'
import { SESSION_COOKIE } from './cookie'

/**
 * Blueprint §9.1 — admin sessions.
 *
 * A signed, httpOnly, Secure, SameSite=Lax cookie with a 12-hour lifetime.
 * The payload carries only what authorisation needs — id, email, role — and
 * is signed with AUTH_SECRET so it cannot be forged or edited.
 */
export { SESSION_COOKIE } from './cookie'
const MAX_AGE_SECONDS = 12 * 3600

export type AdminSession = {
  id: string
  email: string
  role: 'OWNER' | 'STAFF'
  exp: number
}

function sign(payload: string): string {
  return createHmac('sha256', env().AUTH_SECRET).update(payload).digest('base64url')
}

export function serialiseSession(session: AdminSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function parseSession(raw: string | undefined): AdminSession | null {
  if (!raw) return null
  const [payload, signature] = raw.split('.')
  if (!payload || !signature) return null

  const expected = Buffer.from(sign(payload))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length) return null
  if (!timingSafeEqual(expected, actual)) return null

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString()) as AdminSession
    if (typeof session.exp !== 'number' || session.exp * 1000 < Date.now()) return null
    if (!session.id || !session.email) return null
    return session
  } catch {
    return null
  }
}

export async function setSessionCookie(session: Omit<AdminSession, 'exp'>): Promise<void> {
  const full: AdminSession = {
    ...session,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  }
  const store = await cookies()
  store.set(SESSION_COOKIE, serialiseSession(full), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

export async function currentSession(): Promise<AdminSession | null> {
  const store = await cookies()
  return parseSession(store.get(SESSION_COOKIE)?.value)
}

/**
 * Every admin page and action calls this. It THROWS rather than returning
 * null, so a forgotten check is a crash in development, not a silent hole.
 */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await currentSession()
  if (!session) throw new Error('UNAUTHORISED')
  return session
}
