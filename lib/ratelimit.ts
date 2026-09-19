import 'server-only'

/**
 * Blueprint §12.1 — rate limiting.
 *
 * Backed by Upstash Redis when configured; otherwise an in-process fallback
 * that is correct on a single instance and honest about not being correct
 * across several. Redis is a convenience store here, never a source of truth
 * (§02): losing it costs rate limiting, never an order.
 */

export type RateLimitResult = { ok: boolean; remaining: number }

type Bucket = { count: number; resetAt: number }
const memory = new Map<string, Bucket>()

const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN
const redisConfigured = Boolean(url && token)

export async function rateLimit(
  key: string,
  opts: { limit: number; windowSec: number; failClosed?: boolean },
): Promise<RateLimitResult> {
  if (!redisConfigured) return memoryLimit(key, opts)

  try {
    // INCR then EXPIRE on first hit — two commands, pipelined.
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, String(opts.windowSec), 'NX'],
      ]),
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) throw new Error(`redis ${res.status}`)
    const body = (await res.json()) as { result: number }[]
    const count = Number(body[0]?.result ?? 0)
    return { ok: count <= opts.limit, remaining: Math.max(0, opts.limit - count) }
  } catch {
    // §12.5: browsing fails OPEN, write paths fail CLOSED.
    if (opts.failClosed) return { ok: false, remaining: 0 }
    return memoryLimit(key, opts)
  }
}

function memoryLimit(key: string, opts: { limit: number; windowSec: number }): RateLimitResult {
  const now = Date.now()
  const bucket = memory.get(key)

  if (!bucket || bucket.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + opts.windowSec * 1000 })
    return { ok: true, remaining: opts.limit - 1 }
  }

  bucket.count += 1
  if (memory.size > 10_000) pruneMemory(now)
  return { ok: bucket.count <= opts.limit, remaining: Math.max(0, opts.limit - bucket.count) }
}

function pruneMemory(now: number): void {
  for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k)
}

/** Test seam. */
export function __resetRateLimits(): void {
  memory.clear()
}
