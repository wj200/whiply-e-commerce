import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import {
  generateTotpSecret,
  totpAt,
  verifyTotp,
  base32Decode,
  totpUri,
} from '@/lib/auth/totp'

describe('password hashing (§9.1)', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true)
  })

  it('REJECTS a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('Correct horse battery staple', hash)).toBe(false)
    expect(await verifyPassword('', hash)).toBe(false)
  })

  it('salts — the same password hashes differently every time', async () => {
    const a = await hashPassword('same')
    const b = await hashPassword('same')
    expect(a).not.toBe(b)
    expect(await verifyPassword('same', a)).toBe(true)
    expect(await verifyPassword('same', b)).toBe(true)
  })

  it('stores its parameters so they can be raised later', async () => {
    const hash = await hashPassword('x')
    expect(hash.startsWith('scrypt$16384$8$1$')).toBe(true)
  })

  it('rejects a malformed stored hash instead of throwing', async () => {
    for (const bad of ['', 'nonsense', 'scrypt$1$2$3', 'bcrypt$16384$8$1$aa$bb']) {
      expect(await verifyPassword('x', bad)).toBe(false)
    }
  })
})

describe('TOTP (RFC 6238)', () => {
  // RFC 6238 test vector: ASCII "12345678901234567890" in base32.
  const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

  it('matches the RFC 6238 SHA-1 test vectors', () => {
    expect(totpAt(RFC_SECRET, Math.floor(59 / 30))).toBe('287082')
    expect(totpAt(RFC_SECRET, Math.floor(1111111109 / 30))).toBe('081804')
    expect(totpAt(RFC_SECRET, Math.floor(1234567890 / 30))).toBe('005924')
  })

  it('decodes base32 to the documented bytes', () => {
    expect(base32Decode(RFC_SECRET).toString()).toBe('12345678901234567890')
  })

  it('accepts the current code', () => {
    const secret = generateTotpSecret()
    const now = new Date()
    const code = totpAt(secret, Math.floor(now.getTime() / 1000 / 30))
    expect(verifyTotp(secret, code, now)).toBe(true)
  })

  it('accepts one step of clock drift either way', () => {
    const secret = generateTotpSecret()
    const now = new Date()
    const counter = Math.floor(now.getTime() / 1000 / 30)
    expect(verifyTotp(secret, totpAt(secret, counter - 1), now)).toBe(true)
    expect(verifyTotp(secret, totpAt(secret, counter + 1), now)).toBe(true)
  })

  it('REJECTS a code two steps stale', () => {
    const secret = generateTotpSecret()
    const now = new Date()
    const counter = Math.floor(now.getTime() / 1000 / 30)
    expect(verifyTotp(secret, totpAt(secret, counter - 2), now)).toBe(false)
  })

  it('REJECTS a code from a different secret', () => {
    const a = generateTotpSecret()
    const b = generateTotpSecret()
    const now = new Date()
    const code = totpAt(b, Math.floor(now.getTime() / 1000 / 30))
    expect(verifyTotp(a, code, now)).toBe(false)
  })

  it('rejects malformed tokens without throwing', () => {
    const secret = generateTotpSecret()
    for (const bad of ['', '12345', '1234567', 'abcdef', '12 34 56 78']) {
      expect(verifyTotp(secret, bad)).toBe(false)
    }
  })

  it('tolerates spaces in a pasted code', () => {
    const secret = generateTotpSecret()
    const now = new Date()
    const code = totpAt(secret, Math.floor(now.getTime() / 1000 / 30))
    expect(verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, now)).toBe(true)
  })

  it('builds an otpauth URI an authenticator app can read', () => {
    const uri = totpUri('JBSWY3DPEHPK3PXP', 'owner@whiply.sg')
    expect(uri).toContain('otpauth://totp/')
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP')
    expect(uri).toContain('issuer=WHIPLY')
    expect(uri).toContain('digits=6')
  })
})
