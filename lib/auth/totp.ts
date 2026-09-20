import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Blueprint §9.1 — mandatory TOTP for the admin panel (RFC 6238).
 *
 * Thirty-second steps, six digits, SHA-1 (what every authenticator app
 * implements). A ±1 step window absorbs clock drift without opening a
 * meaningful replay window.
 */
const STEP_SECONDS = 30
const DIGITS = 6
const WINDOW = 1

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function generateTotpSecret(): string {
  const bytes = randomBytes(20)
  let bits = ''
  for (const b of bytes) bits += b.toString(2).padStart(8, '0')
  let out = ''
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += B32[Number.parseInt(bits.slice(i, i + 5), 2)]
  }
  return out
}

export function base32Decode(secret: string): Buffer {
  const clean = secret.replace(/=+$/, '').toUpperCase().replace(/\s/g, '')
  let bits = ''
  for (const char of clean) {
    const idx = B32.indexOf(char)
    if (idx === -1) throw new Error('Invalid base32 character in TOTP secret')
    bits += idx.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2))
  }
  return Buffer.from(bytes)
}

export function totpAt(secret: string, counter: number): string {
  const key = base32Decode(secret)
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))

  const digest = createHmac('sha1', key).update(buf).digest()
  const offset = digest[digest.length - 1]! & 0x0f
  const code =
    (((digest[offset]! & 0x7f) << 24) |
      ((digest[offset + 1]! & 0xff) << 16) |
      ((digest[offset + 2]! & 0xff) << 8) |
      (digest[offset + 3]! & 0xff)) %
    10 ** DIGITS

  return String(code).padStart(DIGITS, '0')
}

export function verifyTotp(secret: string, token: string, now: Date = new Date()): boolean {
  const cleaned = token.replace(/\s/g, '')
  if (!/^\d{6}$/.test(cleaned)) return false

  const counter = Math.floor(now.getTime() / 1000 / STEP_SECONDS)
  for (let drift = -WINDOW; drift <= WINDOW; drift += 1) {
    const expected = totpAt(secret, counter + drift)
    const a = Buffer.from(expected)
    const b = Buffer.from(cleaned)
    if (a.length === b.length && timingSafeEqual(a, b)) return true
  }
  return false
}

/** otpauth:// URI for an authenticator app. */
export function totpUri(secret: string, email: string, issuer = 'WHIPLY'): string {
  const label = encodeURIComponent(`${issuer}:${email}`)
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  })
  return `otpauth://totp/${label}?${params.toString()}`
}
