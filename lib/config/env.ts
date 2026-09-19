import { z } from 'zod'

/**
 * Blueprint §14.2 — every environment variable is PARSED at boot.
 *
 * A missing or malformed value fails the build/deploy rather than producing a
 * running application with, say, signature verification quietly disabled.
 * That specific failure mode — a webhook handler with no salt to verify
 * against — is the reason this module exists, so HITPAY_WEBHOOK_SALT is
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

  HITPAY_API_BASE: z.string().url(),
  HITPAY_API_KEY: required('HITPAY_API_KEY'),
  HITPAY_WEBHOOK_SALT: required('HITPAY_WEBHOOK_SALT'),

  LALAMOVE_API_BASE: z.string().url(),
  LALAMOVE_API_KEY: required('LALAMOVE_API_KEY'),
  LALAMOVE_API_SECRET: required('LALAMOVE_API_SECRET'),
  LALAMOVE_MARKET: z.string().default('SG'),
  LALAMOVE_WEBHOOK_SECRET: required('LALAMOVE_WEBHOOK_SECRET'),

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
    // Cutover checklist §16.16 item 2, enforced by the deploy.
    if (env.HITPAY_API_BASE.includes('sandbox')) {
      issues.push('HITPAY_API_BASE still points at the sandbox in production')
    }
    if (env.LALAMOVE_API_BASE.includes('sandbox')) {
      issues.push('LALAMOVE_API_BASE still points at the sandbox in production')
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
