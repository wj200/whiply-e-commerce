/**
 * Blueprint §12.3 — structured logging.
 *
 * NEVER LOGGED: full webhook bodies, customer addresses, phone numbers, email
 * addresses, API keys, webhook salts, session cookies, TOTP secrets. Log the
 * SHAPE and the identifiers — order reference, event id, status, latency,
 * outcome — not the contents.
 */

type Level = 'info' | 'warn' | 'error' | 'critical'

const REDACT_KEYS = new Set([
  'email',
  'phone',
  'contactemail',
  'contactphone',
  'contactname',
  'name',
  'address',
  'addressline1',
  'addressline2',
  'postalcode',
  'instructions',
  'password',
  'passwordhash',
  'totpsecret',
  'salt',
  'secret',
  'apikey',
  'token',
  'authorization',
  'cookie',
  'hmac',
  'signature',
])

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[deep]'
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))

  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACT_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(v, depth + 1)
  }
  return out
}

function emit(level: Level, event: string, context: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    level,
    event,
    at: new Date().toISOString(),
    ...(redact(context) as Record<string, unknown>),
  })

  if (level === 'error' || level === 'critical') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  info: (event: string, context?: Record<string, unknown>) => emit('info', event, context),
  warn: (event: string, context?: Record<string, unknown>) => emit('warn', event, context),
  error: (event: string, context?: Record<string, unknown>) => emit('error', event, context),
  /** Reserved for the four conditions in §12.3 that must reach a human. */
  critical: (event: string, context?: Record<string, unknown>) => emit('critical', event, context),
}
