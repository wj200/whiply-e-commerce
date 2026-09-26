import { z } from 'zod'

/**
 * Blueprint §14.2 — every environment variable is PARSED at boot.
 *
 * A missing or malformed value fails the build/deploy rather than producing a
 * running application with, say, signature verification quietly disabled.
 * That specific failure mode — a webhook handler with no secret to verify
 * against — is the reason this module exists, so STRIPE_WEBHOOK_SECRET is
 * required in production and cannot be defaulted.
 */

const required = (name: string) =>
  z.string({ required_error: `${name} is required` }).min(1, `${name} must not be empty`)

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: required('DATABASE_URL'),
  DIRECT_DATABASE_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url('NEXT_PUBLIC_SITE_URL must be an absolute URL'),

  AUTH_SECRET: required('AUTH_SECRET').min(32, 'AUTH_SECRET must be at least 32 characters'),
  CRON_SECRET: required('CRON_SECRET').min(8),

  // Stripe — PayNow only. There is no publishable key here on purpose: the
  // PaymentIntent is created and confirmed server-side and the customer is
  // sent to Stripe's own hosted QR page, so no Stripe.js runs in the browser
  // and no key needs to be exposed to it.
  STRIPE_API_BASE: z.string().url().default('https://api.stripe.com'),
  STRIPE_SECRET_KEY: required('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: required('STRIPE_WEBHOOK_SECRET'),

  // Customer receipt (§8.5). Optional locally; mandatory in production,
  // because a paid order with no invoice is a support ticket every time.
  RESEND_FROM_EMAIL: z.string().optional(),

  // WhatsApp Cloud API — the business's own order alert (§8.6).
  WHATSAPP_API_BASE: z.string().url().default('https://graph.facebook.com/v21.0'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  /** The business's WhatsApp number in E.164, e.g. +6591234567. */
  WHATSAPP_BUSINESS_NUMBER: z.string().optional(),
  /** Empty string = send free-form text instead of a template (dev only). */
  WHATSAPP_TEMPLATE_NAME: z.string().default('whiply_order_alert'),
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().default('en'),

  R2_ACCOUNT_ID: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  NEXT_PUBLIC_R2_PUBLIC_BASE: z.string().url().optional().or(z.literal('')),

  UPSTASH_REDIS_REST_URL: z.string().url().optional().or(z.literal('')),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  OPERATOR_ALERT_EMAIL: z.string().email().optional().or(z.literal('')),

  TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),

  SENTRY_DSN: z.string().optional(),
})

export type Env = z.infer<typeof baseSchema>

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(
      `Invalid environment configuration — refusing to start:\n` +
        issues.map((i) => `  • ${i}`).join('\n'),
    )
    this.name = 'EnvError'
  }
}

/**
 * Production tightens the rules that only matter once real money moves:
 * live secrets must not be placeholders, and the site URL must be https.
 */
export function parseEnv(raw: NodeJS.ProcessEnv): Env {
  const result = baseSchema.safeParse(raw)
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    )
  }

  const env = result.data
  const issues: string[] = []

  if (env.NODE_ENV === 'production') {
    if (!env.NEXT_PUBLIC_SITE_URL.startsWith('https://')) {
      issues.push('NEXT_PUBLIC_SITE_URL must be https in production')
    }
    if (env.AUTH_SECRET.includes('dev-only')) {
      issues.push('AUTH_SECRET is still a development placeholder')
    }
    if (env.CRON_SECRET.includes('dev-only')) {
      issues.push('CRON_SECRET is still a development placeholder')
    }
    // Turnstile is marked optional above because local development runs
    // without it. In production its absence does NOT degrade gracefully:
    // verifyTurnstile() returns false and EVERY bulk enquiry is rejected.
    // A silently dead lead form is worse than a refused deploy.
    if (!env.TURNSTILE_SECRET_KEY) {
      issues.push(
        'TURNSTILE_SECRET_KEY is required in production — without it every bulk ' +
          'order enquiry is rejected',
      )
    }
    if (!env.TURNSTILE_SITE_KEY) {
      issues.push('TURNSTILE_SITE_KEY is required in production — the form cannot render its widget')
    }

    // Cutover checklist §16.16 item 2, enforced by the deploy. A test-mode
    // key in production takes payments that never arrive in the bank.
    if (env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
      issues.push('STRIPE_SECRET_KEY is a TEST key — production must use sk_live_')
    }
    if (!/^sk_(live|test)_/.test(env.STRIPE_SECRET_KEY)) {
      issues.push('STRIPE_SECRET_KEY does not look like a Stripe secret key')
    }
    if (!env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')) {
      issues.push('STRIPE_WEBHOOK_SECRET does not look like a Stripe signing secret')
    }

    // The receipt path fails the same way Turnstile did: silently. Without a
    // key, every paid customer gets no invoice and the deploy reports success.
    if (!env.RESEND_API_KEY) {
      issues.push(
        'RESEND_API_KEY is required in production — without it no customer ' +
          'receives a receipt for a paid order',
      )
    }
    if (!env.RESEND_FROM_EMAIL) {
      issues.push('RESEND_FROM_EMAIL is required in production — receipts need a verified sender')
    }

    // Likewise the business alert: the whole point is that someone finds out
    // an order came in.
    const whatsapp = [
      ['WHATSAPP_PHONE_NUMBER_ID', env.WHATSAPP_PHONE_NUMBER_ID],
      ['WHATSAPP_ACCESS_TOKEN', env.WHATSAPP_ACCESS_TOKEN],
      ['WHATSAPP_BUSINESS_NUMBER', env.WHATSAPP_BUSINESS_NUMBER],
    ] as const
    for (const [name, value] of whatsapp) {
      if (!value) {
        issues.push(
          `${name} is required in production — without it no order notification ` +
            'reaches the business WhatsApp number',
        )
      }
    }
    if (env.WHATSAPP_BUSINESS_NUMBER && !/^\+[1-9]\d{7,14}$/.test(env.WHATSAPP_BUSINESS_NUMBER)) {
      issues.push('WHATSAPP_BUSINESS_NUMBER must be E.164, e.g. +6591234567')
    }
    if (!env.WHATSAPP_TEMPLATE_NAME) {
      issues.push(
        'WHATSAPP_TEMPLATE_NAME must be set in production — a business-initiated ' +
          'message outside a 24-hour session window must use an approved template',
      )
    }
  }

  if (issues.length) throw new EnvError(issues)
  return env
}

let cached: Env | null = null

export function env(): Env {
  if (!cached) cached = parseEnv(process.env)
  return cached
}

/** Test seam. */
export function resetEnvCache(): void {
  cached = null
}
