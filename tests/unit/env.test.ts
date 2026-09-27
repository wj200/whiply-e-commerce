import { describe, it, expect } from 'vitest'
import {
  parseEnv,
  EnvError,
  isProductionRuntime,
  whatsappAlertsEnabled,
} from '@/lib/config/env'

const VALID = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u@h/db',
  NEXT_PUBLIC_SITE_URL: 'https://whiply.sg',
  AUTH_SECRET: 'x'.repeat(32),
  CRON_SECRET: 'y'.repeat(16),
  STRIPE_SECRET_KEY: 'sk_live_abc123',
  STRIPE_WEBHOOK_SECRET: 'whsec_abc123',
  RESEND_API_KEY: 're_abc123',
  RESEND_FROM_EMAIL: 'WHIPLY <orders@whiply.sg>',
  WHATSAPP_PHONE_NUMBER_ID: '123456789',
  WHATSAPP_ACCESS_TOKEN: 'EAAG...',
  WHATSAPP_BUSINESS_NUMBER: '+6591234567',
  TURNSTILE_SITE_KEY: 'site',
  TURNSTILE_SECRET_KEY: 'secret',
} as unknown as NodeJS.ProcessEnv

function without(key: string): NodeJS.ProcessEnv {
  const copy = { ...(VALID as Record<string, string>) }
  delete copy[key]
  return copy as NodeJS.ProcessEnv
}

describe('parseEnv', () => {
  it('accepts a complete production environment', () => {
    expect(() => parseEnv(VALID)).not.toThrow()
  })

  it('REFUSES TO START without STRIPE_WEBHOOK_SECRET', () => {
    expect(() => parseEnv(without('STRIPE_WEBHOOK_SECRET'))).toThrow(EnvError)
    expect(() => parseEnv(without('STRIPE_WEBHOOK_SECRET'))).toThrow(/STRIPE_WEBHOOK_SECRET/)
  })

  it('names every missing variable at once, not one per attempt', () => {
    try {
      parseEnv({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as EnvError).issues.length).toBeGreaterThan(4)
    }
  })

  it('rejects a TEST Stripe key in production — cutover §16.16', () => {
    expect(() => parseEnv({ ...VALID, STRIPE_SECRET_KEY: 'sk_test_abc' })).toThrow(/TEST key/)
  })

  it('rejects something that is not a Stripe secret key at all', () => {
    expect(() => parseEnv({ ...VALID, STRIPE_SECRET_KEY: 'pk_live_abc' })).toThrow(
      /does not look like a Stripe secret key/,
    )
  })

  it('rejects a signing secret that is not one', () => {
    expect(() => parseEnv({ ...VALID, STRIPE_WEBHOOK_SECRET: 'abc' })).toThrow(
      /Stripe signing secret/,
    )
  })

  it('rejects a development placeholder secret in production', () => {
    expect(() => parseEnv({ ...VALID, AUTH_SECRET: 'dev-only-auth-secret-padding-1234' })).toThrow(
      /placeholder/,
    )
  })

  it('rejects plain http in production', () => {
    expect(() => parseEnv({ ...VALID, NEXT_PUBLIC_SITE_URL: 'http://whiply.sg' })).toThrow(/https/)
  })

  it('REFUSES TO START without Turnstile keys in production — a silently dead lead form is worse', () => {
    expect(() => parseEnv(without('TURNSTILE_SECRET_KEY'))).toThrow(/TURNSTILE_SECRET_KEY/)
    expect(() => parseEnv(without('TURNSTILE_SITE_KEY'))).toThrow(/TURNSTILE_SITE_KEY/)
  })

  it('REFUSES TO START without Resend keys — a paid order with no receipt fails silently', () => {
    expect(() => parseEnv(without('RESEND_API_KEY'))).toThrow(/no customer/)
    expect(() => parseEnv(without('RESEND_FROM_EMAIL'))).toThrow(/verified sender/)
  })

  it('REFUSES TO START without WhatsApp credentials — nobody would learn an order came in', () => {
    for (const key of [
      'WHATSAPP_PHONE_NUMBER_ID',
      'WHATSAPP_ACCESS_TOKEN',
      'WHATSAPP_BUSINESS_NUMBER',
    ]) {
      expect(() => parseEnv(without(key))).toThrow(new RegExp(key))
    }
  })

  it('rejects a business number that is not E.164', () => {
    expect(() => parseEnv({ ...VALID, WHATSAPP_BUSINESS_NUMBER: '91234567' })).toThrow(/E.164/)
  })

  it('REFUSES an empty WhatsApp template name in production', () => {
    // Free-form messages are accepted by Meta's API and then not delivered,
    // which is the worst possible failure mode: a green deploy and silence.
    expect(() => parseEnv({ ...VALID, WHATSAPP_TEMPLATE_NAME: '' })).toThrow(/approved template/)
  })

  it('defaults the API bases so a correct deploy needs fewer variables', () => {
    const env = parseEnv(VALID)
    expect(env.STRIPE_API_BASE).toBe('https://api.stripe.com')
    expect(env.WHATSAPP_API_BASE).toContain('graph.facebook.com')
    expect(env.WHATSAPP_TEMPLATE_NAME).toBe('whiply_order_alert')
  })

  it('requires none of the production hardening in development', () => {
    const copy = { ...(VALID as Record<string, string>) }
    for (const key of [
      'TURNSTILE_SECRET_KEY',
      'TURNSTILE_SITE_KEY',
      'RESEND_API_KEY',
      'RESEND_FROM_EMAIL',
      'WHATSAPP_PHONE_NUMBER_ID',
      'WHATSAPP_ACCESS_TOKEN',
      'WHATSAPP_BUSINESS_NUMBER',
    ]) {
      delete copy[key]
    }
    expect(() =>
      parseEnv({
        ...copy,
        NODE_ENV: 'development',
        NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
        STRIPE_SECRET_KEY: 'sk_test_abc',
      } as NodeJS.ProcessEnv),
    ).not.toThrow()
  })
})

describe('isProductionRuntime — which deployment is the real one', () => {
  it('trusts VERCEL_ENV over NODE_ENV when Vercel sets it', () => {
    // Vercel forces NODE_ENV=production for PREVIEW builds too. Keying the
    // hardening off NODE_ENV alone would demand live Stripe, Turnstile and
    // WhatsApp credentials on every pull-request preview — the exact
    // arrangement the blueprint says must never exist.
    expect(isProductionRuntime({ NODE_ENV: 'production', VERCEL_ENV: 'preview' })).toBe(false)
    expect(isProductionRuntime({ NODE_ENV: 'production', VERCEL_ENV: 'development' })).toBe(false)
    expect(isProductionRuntime({ NODE_ENV: 'production', VERCEL_ENV: 'production' })).toBe(true)
  })

  it('falls back to NODE_ENV off Vercel, which is the conservative answer', () => {
    expect(isProductionRuntime({ NODE_ENV: 'production' })).toBe(true)
    expect(isProductionRuntime({ NODE_ENV: 'development' })).toBe(false)
  })

  it('lets a PREVIEW deploy run on test keys', () => {
    const preview: Record<string, string> = { ...(VALID as Record<string, string>) }
    preview.VERCEL_ENV = 'preview'
    preview.STRIPE_SECRET_KEY = 'sk_test_preview'
    preview.NEXT_PUBLIC_SITE_URL = 'https://whiply-git-branch.vercel.app'
    delete preview.WHATSAPP_ACCESS_TOKEN
    delete preview.RESEND_API_KEY
    expect(() => parseEnv(preview as NodeJS.ProcessEnv)).not.toThrow()
  })

  it('still refuses a TEST key on the real production deployment', () => {
    expect(() =>
      parseEnv({ ...VALID, VERCEL_ENV: 'production', STRIPE_SECRET_KEY: 'sk_test_oops' }),
    ).toThrow(/TEST key/)
  })
})

describe('WHATSAPP_ALERTS_DISABLED — launching before Meta approves', () => {
  function withoutWhatsApp(): Record<string, string> {
    const copy = { ...(VALID as Record<string, string>) }
    for (const key of [
      'WHATSAPP_PHONE_NUMBER_ID',
      'WHATSAPP_ACCESS_TOKEN',
      'WHATSAPP_BUSINESS_NUMBER',
    ]) {
      delete copy[key]
    }
    return copy
  }

  it('lets production start with NO WhatsApp credentials when switched off', () => {
    const off: Record<string, string> = { ...withoutWhatsApp() }
    off.WHATSAPP_ALERTS_DISABLED = 'true'
    const env = parseEnv(off as NodeJS.ProcessEnv)
    expect(whatsappAlertsEnabled(env)).toBe(false)
  })

  it('still refuses when the credentials are simply missing', () => {
    expect(() => parseEnv(withoutWhatsApp() as NodeJS.ProcessEnv)).toThrow(
      /WHATSAPP_PHONE_NUMBER_ID/,
    )
  })

  it('names the escape hatch in the error, so the fix is discoverable', () => {
    expect(() => parseEnv(withoutWhatsApp() as NodeJS.ProcessEnv)).toThrow(
      /WHATSAPP_ALERTS_DISABLED=true/,
    )
  })

  it('takes ONLY the exact string "true" — a near miss must not disable alerts', () => {
    // A typo here would silently remove the only thing that tells the shop an
    // order arrived, so anything but 'true' leaves alerts on AND keeps the
    // credential requirement in force.
    for (const value of ['TRUE', 'True', '1', 'yes', 'on', '', ' true']) {
      expect(whatsappAlertsEnabled({ WHATSAPP_ALERTS_DISABLED: value })).toBe(true)
      const near: Record<string, string> = { ...withoutWhatsApp() }
      near.WHATSAPP_ALERTS_DISABLED = value
      expect(() => parseEnv(near as NodeJS.ProcessEnv)).toThrow(/WHATSAPP_PHONE_NUMBER_ID/)
    }
  })

  it('defaults to alerts ON when the variable is absent entirely', () => {
    expect(whatsappAlertsEnabled({})).toBe(true)
  })

  it('does not disable the RECEIPT — a customer still gets their invoice', () => {
    const copy: Record<string, string> = withoutWhatsApp()
    delete copy.RESEND_API_KEY
    copy.WHATSAPP_ALERTS_DISABLED = 'true'
    expect(() => parseEnv(copy as NodeJS.ProcessEnv)).toThrow(/RESEND_API_KEY/)
  })
})
