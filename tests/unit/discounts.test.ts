import { describe, it, expect } from 'vitest'
import {
  validateDiscountCode,
  normaliseCode,
  describeCode,
  seasonPhase,
  type DiscountCodeRow,
} from '@/lib/domain/discounts'

const NOW = new Date('2026-06-15T10:00:00Z')

function timeCode(over: Partial<DiscountCodeRow> = {}): DiscountCodeRow {
  return {
    id: 'c1',
    code: 'WELCOME10',
    valueType: 'PERCENT',
    percentOff: 10,
    valueCents: null,
    limitType: 'TIME_LIMITED',
    startsAt: null,
    expiresAt: new Date('2026-12-31T23:59:59Z'),
    maxUses: null,
    usesCount: 0,
    attributionLabel: null,
    seasonLabel: null,
    isActive: true,
    ...over,
  }
}

function seasonCode(over: Partial<DiscountCodeRow> = {}): DiscountCodeRow {
  return timeCode({
    code: 'XMAS26',
    limitType: 'SEASONAL',
    seasonLabel: 'Christmas 2026',
    startsAt: new Date('2026-06-01T00:00:00Z'),
    expiresAt: new Date('2026-06-30T00:00:00Z'),
    maxUses: null,
    ...over,
  })
}

function useCode(over: Partial<DiscountCodeRow> = {}): DiscountCodeRow {
  return timeCode({
    code: 'FIVEONLY',
    limitType: 'USE_LIMITED',
    expiresAt: null,
    maxUses: 5,
    usesCount: 0,
    ...over,
  })
}

const opts = { now: NOW, subtotalCents: 10000 }

describe('normaliseCode', () => {
  it('uppercases and trims, so welcome10 works', () => {
    expect(normaliseCode('  welcome10 ')).toBe('WELCOME10')
    expect(normaliseCode('WeLcOmE10')).toBe('WELCOME10')
  })
})

describe('validateDiscountCode — ordered checks (§5.5)', () => {
  it('1 — an unknown code', () => {
    const r = validateDiscountCode(null, opts)
    expect(r.ok).toBe(false)
    expect(r).toMatchObject({ reason: 'NOT_FOUND', message: "That code isn't recognised." })
  })

  it('2 — an inactive code', () => {
    const r = validateDiscountCode(timeCode({ isActive: false }), opts)
    expect(r).toMatchObject({ reason: 'INACTIVE' })
  })

  it('3 — a code that has not started', () => {
    const r = validateDiscountCode(
      timeCode({ startsAt: new Date('2026-07-01T00:00:00Z') }),
      opts,
    )
    expect(r).toMatchObject({ reason: 'NOT_STARTED' })
  })

  it('4 — an expired code, with the date in the message', () => {
    const r = validateDiscountCode(
      timeCode({ expiresAt: new Date('2025-12-31T00:00:00Z') }),
      opts,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/expired on 31 Dec 2025/)
  })

  it('5 — a fully redeemed use-limited code', () => {
    const r = validateDiscountCode(useCode({ usesCount: 5, maxUses: 5 }), opts)
    expect(r).toMatchObject({ reason: 'FULLY_REDEEMED' })
  })

  it('6 — a code that changes nothing', () => {
    const r = validateDiscountCode(timeCode(), { now: NOW, subtotalCents: 0 })
    expect(r).toMatchObject({ reason: 'NO_EFFECT' })
  })

  it('accepts a valid code', () => {
    const r = validateDiscountCode(timeCode(), opts)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.code.percentOff).toBe(10)
  })
})

describe('time-limited codes at the boundary', () => {
  it('is valid ONE SECOND BEFORE expiry', () => {
    const expiresAt = new Date(NOW.getTime() + 1000)
    expect(validateDiscountCode(timeCode({ expiresAt }), opts).ok).toBe(true)
  })

  it('is REFUSED at the instant of expiry', () => {
    expect(validateDiscountCode(timeCode({ expiresAt: NOW }), opts).ok).toBe(false)
  })

  it('is REFUSED one second after expiry', () => {
    const expiresAt = new Date(NOW.getTime() - 1000)
    const r = validateDiscountCode(timeCode({ expiresAt }), opts)
    expect(r).toMatchObject({ reason: 'EXPIRED' })
  })

  it('handles an "expires in one week" code created today', () => {
    const expiresAt = new Date(NOW.getTime() + 7 * 24 * 3600 * 1000)
    expect(validateDiscountCode(timeCode({ expiresAt }), opts).ok).toBe(true)
    const later = { now: new Date(NOW.getTime() + 8 * 24 * 3600 * 1000), subtotalCents: 10000 }
    expect(validateDiscountCode(timeCode({ expiresAt }), later).ok).toBe(false)
  })
})

describe('use-limited codes at the boundary', () => {
  it('is valid at limit - 1', () => {
    expect(validateDiscountCode(useCode({ usesCount: 4, maxUses: 5 }), opts).ok).toBe(true)
  })

  it('is REFUSED on the sixth attempt of a five-use code', () => {
    expect(validateDiscountCode(useCode({ usesCount: 5, maxUses: 5 }), opts).ok).toBe(false)
  })

  it('is REFUSED if usage somehow overshot the limit', () => {
    expect(validateDiscountCode(useCode({ usesCount: 9, maxUses: 5 }), opts).ok).toBe(false)
  })

  it('does NOT expire on a date — a use-limited code has no expiry', () => {
    const farFuture = { now: new Date('2099-01-01T00:00:00Z'), subtotalCents: 10000 }
    expect(validateDiscountCode(useCode(), farFuture).ok).toBe(true)
  })
})

describe('fixed-amount codes', () => {
  it('validates a fixed code', () => {
    const r = validateDiscountCode(
      timeCode({ valueType: 'FIXED', percentOff: null, valueCents: 1500 }),
      opts,
    )
    expect(r.ok).toBe(true)
  })

  it('rejects one with no value set', () => {
    const r = validateDiscountCode(
      timeCode({ valueType: 'FIXED', percentOff: null, valueCents: null }),
      opts,
    )
    expect(r).toMatchObject({ reason: 'NO_EFFECT' })
  })
})

describe('describeCode', () => {
  it('summarises a time-limited percent code', () => {
    expect(describeCode(timeCode())).toBe('10% off · expires 31 Dec 2026')
  })

  it('summarises a use-limited fixed code', () => {
    expect(
      describeCode(
        useCode({ valueType: 'FIXED', percentOff: null, valueCents: 1500, usesCount: 2 }),
      ),
    ).toBe('S$15.00 off · 2/5 uses')
  })
})

describe('SEASONAL codes — a campaign that switches itself on and off', () => {
  it('applies inside its window', () => {
    const r = validateDiscountCode(seasonCode(), opts)
    expect(r.ok).toBe(true)
  })

  it('REFUSES before the season opens, naming the season and the date', () => {
    const r = validateDiscountCode(
      seasonCode({ startsAt: new Date('2026-12-01T00:00:00Z') }),
      opts,
    )
    expect(r).toMatchObject({ ok: false, reason: 'NOT_STARTED' })
    if (!r.ok) {
      expect(r.message).toContain('Christmas 2026')
      expect(r.message).toContain('1 Dec 2026')
    }
  })

  it('REFUSES after the season closes, WITHOUT anyone disabling it', () => {
    // This is the whole point of the limit type: nobody has to remember.
    const r = validateDiscountCode(
      seasonCode({
        startsAt: new Date('2026-01-01T00:00:00Z'),
        expiresAt: new Date('2026-02-01T00:00:00Z'),
        isActive: true,
      }),
      opts,
    )
    expect(r).toMatchObject({ ok: false, reason: 'SEASON_ENDED' })
    if (!r.ok) expect(r.message).toContain('Christmas 2026')
  })

  it('falls back to generic wording when the season was never named', () => {
    const r = validateDiscountCode(
      seasonCode({ seasonLabel: null, expiresAt: new Date('2026-02-01T00:00:00Z') }),
      opts,
    )
    expect(r).toMatchObject({ ok: false, reason: 'SEASON_ENDED' })
  })

  it('is NOT limited by uses — that is a different limit type', () => {
    const r = validateDiscountCode(seasonCode({ usesCount: 10_000 }), opts)
    expect(r.ok).toBe(true)
  })

  it('still answers to the manual off switch', () => {
    const r = validateDiscountCode(seasonCode({ isActive: false }), opts)
    expect(r).toMatchObject({ ok: false, reason: 'INACTIVE' })
  })

  it('reports its phase for the admin list', () => {
    expect(seasonPhase(seasonCode(), NOW)).toBe('RUNNING')
    expect(seasonPhase(seasonCode({ startsAt: new Date('2026-12-01') }), NOW)).toBe('UPCOMING')
    expect(seasonPhase(seasonCode({ expiresAt: new Date('2026-01-01') }), NOW)).toBe('ENDED')
    expect(seasonPhase(timeCode(), NOW)).toBe('NOT_SEASONAL')
  })

  it('describes itself with the season and both dates', () => {
    expect(describeCode(seasonCode())).toBe(
      '10% off · Christmas 2026 · 1 Jun 2026 – 30 Jun 2026',
    )
  })
})
