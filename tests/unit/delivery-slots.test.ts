import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SLOT_RULES,
  availableSlots,
  addWorkingDays,
  formatSlot,
  formatSlotWithDate,
  orderingWindow,
  sgtDateKey,
  sgtInstant,
  sgtParts,
  validateSlotChoice,
} from '@/lib/domain/delivery-slots'

/** A Singapore wall-clock time, as the instant it actually happens. */
const sgt = (day: number, hour: number, minute = 0) =>
  sgtInstant({ year: 2026, month: 9, day, hour, minute })

// 2026-09-28 is a Monday, which keeps working-day arithmetic legible.
const MON = 28

describe('SGT conversion', () => {
  it('is UTC+8 with no daylight saving, in both directions', () => {
    const instant = sgt(MON, 10)
    expect(instant.toISOString()).toBe('2026-09-28T02:00:00.000Z')
    expect(sgtParts(instant)).toMatchObject({ year: 2026, month: 9, day: 28, hour: 10 })
  })

  it('keeps the SGT calendar day across the UTC midnight boundary', () => {
    // 1am SGT on the 29th is 5pm UTC on the 28th. A naive UTC read would
    // file this under the wrong day and offer yesterday's slots.
    const instant = sgt(29, 1)
    expect(instant.toISOString()).toBe('2026-09-28T17:00:00.000Z')
    expect(sgtDateKey(instant)).toBe('2026-09-29')
  })
})

describe('the ordering window', () => {
  it('is open during the day', () => {
    expect(orderingWindow(sgt(MON, 14)).open).toBe(true)
  })

  it('CLOSES at 10pm — the last order of the day', () => {
    expect(orderingWindow(sgt(MON, 21, 59)).open).toBe(true)
    const closed = orderingWindow(sgt(MON, 22, 0))
    expect(closed.open).toBe(false)
    expect(closed).toMatchObject({ reason: 'AFTER_CUTOFF' })
  })

  it('is closed before opening, and says when it opens', () => {
    const shut = orderingWindow(sgt(MON, 7))
    expect(shut.open).toBe(false)
    if (!shut.open) {
      expect(shut.reason).toBe('BEFORE_OPENING')
      expect(shut.message).toContain('10am')
    }
  })
})

describe('express slots', () => {
  it('offers only slots at least an hour away and within the two-hour promise', () => {
    const slots = availableSlots({ method: 'EXPRESS', now: sgt(MON, 12, 0) })
    expect(slots.map((s) => formatSlot(s))).toEqual(['1pm – 2pm', '2pm – 3pm'])
  })

  it('drops a slot the moment it falls inside the notice period', () => {
    const slots = availableSlots({ method: 'EXPRESS', now: sgt(MON, 12, 1) })
    // 1pm is now 59 minutes away, so it goes.
    expect(slots.map((s) => formatSlot(s))).toEqual(['2pm – 3pm'])
  })

  it('RUNS OUT before the site closes — the last slot still needs its hour', () => {
    // Ordering stays open until 10pm, but the last slot starts at 10pm, so
    // express stops being offered from 9pm. This is the one place the three
    // published rules do not line up, and it is resolved in the customer's
    // favour: they are told, rather than sold a slot we cannot make.
    expect(orderingWindow(sgt(MON, 21, 30)).open).toBe(true)
    expect(availableSlots({ method: 'EXPRESS', now: sgt(MON, 21, 30) })).toEqual([])
  })

  it('offers the last slot of the day at exactly the notice deadline', () => {
    const slots = availableSlots({ method: 'EXPRESS', now: sgt(MON, 21, 0) })
    expect(slots.map((s) => formatSlot(s))).toEqual(['10pm – 11pm'])
  })

  it('never offers a slot outside 10am–11pm', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      for (const slot of availableSlots({ method: 'EXPRESS', now: sgt(MON, hour) })) {
        const start = sgtParts(slot.start).hour
        expect(start).toBeGreaterThanOrEqual(DEFAULT_SLOT_RULES.firstHour)
        expect(start).toBeLessThanOrEqual(DEFAULT_SLOT_RULES.lastStartHour)
      }
    }
  })
})

describe('standard slots', () => {
  it('lands 2–3 WORKING days out, skipping the weekend', () => {
    // Thursday 1 Oct 2026 + 2 working days = Monday 5 Oct.
    const thursday = sgtInstant({ year: 2026, month: 10, day: 1, hour: 12 })
    const days = new Set(
      availableSlots({ method: 'STANDARD', now: thursday }).map((s) => sgtDateKey(s.start)),
    )
    expect([...days].sort()).toEqual(['2026-10-05', '2026-10-06'])
  })

  it('offers every slot on each of those days', () => {
    const slots = availableSlots({ method: 'STANDARD', now: sgt(MON, 12) })
    const perDay = DEFAULT_SLOT_RULES.lastStartHour - DEFAULT_SLOT_RULES.firstHour + 1
    expect(slots.length).toBe(perDay * 2)
  })

  it('addWorkingDays never lands on a Saturday or Sunday', () => {
    for (let start = 1; start <= 30; start += 1) {
      for (let n = 1; n <= 5; n += 1) {
        const weekday = sgtParts(addWorkingDays(sgt(start, 12), n)).weekday
        expect(weekday).toBeGreaterThanOrEqual(1)
        expect(weekday).toBeLessThanOrEqual(5)
      }
    }
  })
})

describe('validateSlotChoice — GUARD-1 applied to time', () => {
  const now = sgt(MON, 12)

  it('accepts a slot the server itself would offer', () => {
    const slot = availableSlots({ method: 'EXPRESS', now })[0]!
    const result = validateSlotChoice({
      method: 'EXPRESS',
      startIso: slot.start.toISOString(),
      now,
    })
    expect(result).toMatchObject({ ok: true })
    if (result.ok) expect(result.end.getTime() - result.start.getTime()).toBe(3_600_000)
  })

  it('REFUSES a hand-crafted 3am delivery', () => {
    expect(
      validateSlotChoice({ method: 'STANDARD', startIso: sgt(30, 3).toISOString(), now }),
    ).toMatchObject({ ok: false, reason: 'OUT_OF_RANGE' })
  })

  it('REFUSES a slot inside the notice period, and says why', () => {
    const result = validateSlotChoice({
      method: 'EXPRESS',
      startIso: sgt(MON, 12, 30).toISOString(),
      now,
    })
    expect(result).toMatchObject({ ok: false, reason: 'TOO_SOON' })
    if (!result.ok) expect(result.message).toContain('60 minutes')
  })

  it('REFUSES a tomorrow slot booked as EXPRESS', () => {
    // Express is same-day. A valid standard slot is not a valid express one.
    const standard = availableSlots({ method: 'STANDARD', now })[0]!
    expect(
      validateSlotChoice({
        method: 'EXPRESS',
        startIso: standard.start.toISOString(),
        now,
      }),
    ).toMatchObject({ ok: false, reason: 'OUT_OF_RANGE' })
  })

  it('REFUSES a missing or unparseable slot rather than defaulting to one', () => {
    expect(validateSlotChoice({ method: 'STANDARD', startIso: null, now })).toMatchObject({
      ok: false,
      reason: 'MISSING',
    })
    expect(validateSlotChoice({ method: 'STANDARD', startIso: 'soon', now })).toMatchObject({
      ok: false,
      reason: 'NOT_A_SLOT',
    })
  })

  it('REFUSES a slot that was legal a moment ago but is not now', () => {
    const slot = availableSlots({ method: 'EXPRESS', now: sgt(MON, 12, 0) })[0]!
    // Two minutes pass; the 1pm slot is now inside the notice period.
    expect(
      validateSlotChoice({
        method: 'EXPRESS',
        startIso: slot.start.toISOString(),
        now: sgt(MON, 12, 2),
      }),
    ).toMatchObject({ ok: false, reason: 'TOO_SOON' })
  })

  it('honours operator-configured rules rather than the defaults', () => {
    const rules = { ...DEFAULT_SLOT_RULES, firstHour: 8, lastStartHour: 12, leadMinutes: 30 }
    const slots = availableSlots({ method: 'EXPRESS', now: sgt(MON, 9, 0), rules })
    expect(slots.map((s) => formatSlot(s))).toEqual(['10am – 11am', '11am – 12pm'])
  })
})

describe('formatting', () => {
  it('renders a slot the way a receipt reads it', () => {
    expect(formatSlotWithDate({ start: sgt(MON, 10), end: sgt(MON, 11) })).toBe(
      'Mon 28 Sep, 10am – 11am',
    )
  })

  it('renders noon and midnight without a 0 or a 13', () => {
    expect(formatSlot({ start: sgt(MON, 12), end: sgt(MON, 13) })).toBe('12pm – 1pm')
    expect(formatSlot({ start: sgt(MON, 22), end: sgt(MON, 23) })).toBe('10pm – 11pm')
  })
})
