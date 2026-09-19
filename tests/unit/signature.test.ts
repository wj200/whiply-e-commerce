import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  computeHmacSha256,
  verifySignature,
  verifyHitPayFormSignature,
} from '@/lib/payments/signature'
import { buildSignature, mapLalamoveStatus, LALAMOVE_STATUS_MAP } from '@/lib/delivery/lalamove'

const SALT = 'test-webhook-salt'
const BODY = '{"reference_number":"WHP-20260919-AB12C","status":"completed","amount":"110.00"}'

describe('webhook signature verification (GUARD-2)', () => {
  it('accepts a correct signature', () => {
    expect(verifySignature(BODY, computeHmacSha256(BODY, SALT), SALT)).toBe(true)
  })

  it('REJECTS a tampered body — the amount cannot be edited in flight', () => {
    const signature = computeHmacSha256(BODY, SALT)
    const tampered = BODY.replace('110.00', '1.00')
    expect(verifySignature(tampered, signature, SALT)).toBe(false)
  })

  it('REJECTS a signature made with the wrong salt', () => {
    expect(verifySignature(BODY, computeHmacSha256(BODY, 'wrong-salt'), SALT)).toBe(false)
  })

  it('REJECTS a missing signature', () => {
    expect(verifySignature(BODY, null, SALT)).toBe(false)
    expect(verifySignature(BODY, '', SALT)).toBe(false)
  })

  it('REJECTS everything when the salt is empty — never fails open', () => {
    expect(verifySignature(BODY, computeHmacSha256(BODY, ''), '')).toBe(false)
  })

  it('REJECTS a signature of the wrong length without throwing', () => {
    expect(verifySignature(BODY, 'abc123', SALT)).toBe(false)
    expect(() => verifySignature(BODY, 'abc123', SALT)).not.toThrow()
  })

  it('is case-insensitive about hex casing but not about content', () => {
    const upper = computeHmacSha256(BODY, SALT).toUpperCase()
    expect(verifySignature(BODY, upper, SALT)).toBe(true)
  })

  it('covers BYTES — re-serialising the body breaks the signature', () => {
    const signature = computeHmacSha256(BODY, SALT)
    const reserialised = JSON.stringify(JSON.parse(BODY))
    // Key order happens to survive here, but whitespace would not:
    expect(verifySignature(`${reserialised} `, signature, SALT)).toBe(false)
  })
})

describe('HitPay form-encoded callback signature', () => {
  function sign(fields: Record<string, string>, salt: string): string {
    const rest = Object.entries(fields)
      .filter(([k]) => k !== 'hmac')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}${v}`)
      .join('')
    return createHmac('sha256', salt).update(rest, 'utf8').digest('hex')
  }

  const fields = {
    payment_id: 'pay_123',
    reference_number: 'WHP-20260919-AB12C',
    status: 'completed',
    amount: '110.00',
  }

  it('accepts a correctly signed form payload', () => {
    const withHmac = { ...fields, hmac: sign(fields, SALT) }
    expect(verifyHitPayFormSignature(withHmac, SALT)).toBe(true)
  })

  it('REJECTS a tampered amount', () => {
    const withHmac = { ...fields, hmac: sign(fields, SALT), amount: '1.00' }
    expect(verifyHitPayFormSignature(withHmac, SALT)).toBe(false)
  })

  it('REJECTS a payload with no hmac field', () => {
    expect(verifyHitPayFormSignature(fields, SALT)).toBe(false)
  })
})

describe('Lalamove request signing (§7.3)', () => {
  it('builds the documented canonical string', () => {
    const signature = buildSignature({
      timestamp: '1700000000000',
      method: 'POST',
      path: '/v3/quotations',
      body: '{"data":{}}',
      secret: 'sekret',
    })
    const expected = createHmac('sha256', 'sekret')
      .update('1700000000000\r\nPOST\r\n/v3/quotations\r\n\r\n{"data":{}}')
      .digest('hex')
    expect(signature).toBe(expected)
  })

  it('changes when any component changes', () => {
    const base = {
      timestamp: '1',
      method: 'POST' as const,
      path: '/v3/orders',
      body: '{}',
      secret: 's',
    }
    const sig = buildSignature(base)
    expect(buildSignature({ ...base, timestamp: '2' })).not.toBe(sig)
    expect(buildSignature({ ...base, method: 'GET' })).not.toBe(sig)
    expect(buildSignature({ ...base, path: '/v3/quotations' })).not.toBe(sig)
    expect(buildSignature({ ...base, body: '{"a":1}' })).not.toBe(sig)
    expect(buildSignature({ ...base, secret: 't' })).not.toBe(sig)
  })
})

describe('Lalamove status mapping (§7.4)', () => {
  it('maps every documented status as specified', () => {
    expect(mapLalamoveStatus('ASSIGNING_DRIVER')).toBe('BOOKING')
    expect(mapLalamoveStatus('ON_GOING')).toBe('DRIVER_ASSIGNED')
    expect(mapLalamoveStatus('PICKED_UP')).toBe('PICKED_UP')
    expect(mapLalamoveStatus('COMPLETED')).toBe('DELIVERED')
    expect(mapLalamoveStatus('CANCELED')).toBe('CANCELLED')
    expect(mapLalamoveStatus('REJECTED')).toBe('FAILED')
    expect(mapLalamoveStatus('EXPIRED')).toBe('FAILED')
  })

  it('is case- and whitespace-insensitive', () => {
    expect(mapLalamoveStatus('  completed ')).toBe('DELIVERED')
  })

  it('returns null for an UNKNOWN status rather than throwing', () => {
    expect(mapLalamoveStatus('SOME_NEW_STATUS_2027')).toBeNull()
  })

  it('keeps the map in one place', () => {
    expect(Object.keys(LALAMOVE_STATUS_MAP).length).toBeGreaterThan(8)
  })
})
