import { describe, it, expect } from 'vitest'
import { parseEnv, EnvError } from '@/lib/config/env'

const VALID = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u@h/db',
  NEXT_PUBLIC_SITE_URL: 'https://whiply.sg',
  AUTH_SECRET: 'x'.repeat(32),
  CRON_SECRET: 'y'.repeat(16),
  HITPAY_API_BASE: 'https://api.hit-pay.com/v1',
  HITPAY_API_KEY: 'k',
  HITPAY_WEBHOOK_SALT: 's',
  LALAMOVE_API_BASE: 'https://rest.lalamove.com',
  LALAMOVE_API_KEY: 'k',
  LALAMOVE_API_SECRET: 's',
  LALAMOVE_WEBHOOK_SECRET: 'w',
} as unknown as NodeJS.ProcessEnv

describe('parseEnv', () => {
  it('accepts a complete production environment', () => {
    expect(() => parseEnv(VALID)).not.toThrow()
  })

  it('REFUSES TO START without HITPAY_WEBHOOK_SALT', () => {
    const { HITPAY_WEBHOOK_SALT: _omitted, ...without } = VALID as Record<string, string>
    expect(() => parseEnv(without as NodeJS.ProcessEnv)).toThrow(EnvError)
    try {
      parseEnv(without as NodeJS.ProcessEnv)
    } catch (e) {
      expect((e as EnvError).message).toContain('HITPAY_WEBHOOK_SALT')
    }
  })

  it('names every missing variable at once, not one per attempt', () => {
    try {
      parseEnv({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)
      throw new Error('should have thrown')
    } catch (e) {
      const issues = (e as EnvError).issues
      expect(issues.length).toBeGreaterThan(5)
    }
  })

  it('rejects a sandbox payment base URL in production — cutover §16.16', () => {
    expect(() =>
      parseEnv({ ...VALID, HITPAY_API_BASE: 'https://api.sandbox.hit-pay.com/v1' }),
    ).toThrow(/sandbox/)
  })

  it('rejects a sandbox courier base URL in production', () => {
    expect(() =>
      parseEnv({ ...VALID, LALAMOVE_API_BASE: 'https://rest.sandbox.lalamove.com' }),
    ).toThrow(/sandbox/)
  })

  it('rejects a development placeholder secret in production', () => {
    expect(() => parseEnv({ ...VALID, AUTH_SECRET: 'dev-only-auth-secret-padding-1234' })).toThrow(
      /placeholder/,
    )
  })

  it('rejects plain http in production', () => {
    expect(() => parseEnv({ ...VALID, NEXT_PUBLIC_SITE_URL: 'http://whiply.sg' })).toThrow(/https/)
  })

  it('allows the sandbox and http in development', () => {
    expect(() =>
      parseEnv({
        ...VALID,
        NODE_ENV: 'development',
        NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
        HITPAY_API_BASE: 'https://api.sandbox.hit-pay.com/v1',
        LALAMOVE_API_BASE: 'https://rest.sandbox.lalamove.com',
      }),
    ).not.toThrow()
  })
})
