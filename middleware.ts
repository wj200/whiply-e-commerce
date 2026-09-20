import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth/cookie'

/**
 * Blueprint §9.1 — the admin gate, first pass.
 *
 * Middleware runs on the edge runtime, where node:crypto is unavailable, so
 * it can only check that a session cookie is PRESENT. That is a redirect for
 * the unauthenticated, not a security boundary.
 *
 * THE ENFORCEMENT POINT is `requireAdmin()` in the admin layout and in every
 * server action and admin API route, which verifies the signature and expiry
 * on the Node runtime. A forged cookie gets past this middleware and is
 * refused there.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (!pathname.startsWith('/admin') || pathname.startsWith('/admin/login')) {
    return NextResponse.next()
  }

  if (!request.cookies.get(SESSION_COOKIE)) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin/login'
    url.search = `?next=${encodeURIComponent(pathname)}`
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
