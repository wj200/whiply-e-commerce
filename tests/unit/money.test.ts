import { describe, it, expect } from 'vitest'
import {
  cents,
  addCents,
  subCents,
  mulCents,
  percentOf,
  minCents,
  formatSgd,
  toDecimalString,
  centsFromDecimalString,
  MoneyError,
} from '@/lib/money'

describe('cents()', () => {
  it('accepts integers', () => {
    expect(cents(3500)).toBe(3500)
    expect(cents(0)).toBe(0)
    expect(cents(-2000)).toBe(-2000)
  })

  it('rejects fractional values — the 100x-overcharge guard', () => {
    expect(() => cents(35.5)).toThrow(MoneyError)
    expect(() => cents(0.1 + 0.2)).toThrow(MoneyError)
  })

  it('rejects NaN and Infinity', () => {
    expect(() => cents(NaN)).toThrow(MoneyError)
    expect(() => cents(Infinity)).toThrow(MoneyError)
  })
})

describe('arithmetic', () => {
  it('adds and subtracts', () => {
    expect(addCents(cents(3500), cents(9000))).toBe(12500)
    expect(subCents(cents(12500), cents(2000))).toBe(10500)
    expect(addCents()).toBe(0)
  })

  it('multiplies by whole quantities only', () => {
    expect(mulCents(cents(3500), 3)).toBe(10500)
    expect(mulCents(cents(3500), 0)).toBe(0)
    expect(() => mulCents(cents(3500), 1.5)).toThrow(MoneyError)
    expect(() => mulCents(cents(3500), -1)).toThrow(MoneyError)
  })

  it('takes percentages rounding DOWN', () => {
    expect(percentOf(cents(10000), 10)).toBe(1000)
    // 3500 * 10% = 350 exactly
    expect(percentOf(cents(3500), 10)).toBe(350)
    // 3533 * 10% = 353.3 -> 353, in the customer's favour on what is charged
    expect(percentOf(cents(3533), 10)).toBe(353)
    expect(percentOf(cents(999), 33)).toBe(329)
  })

  it('rejects out-of-range percentages', () => {
    expect(() => percentOf(cents(1000), 101)).toThrow(MoneyError)
    expect(() => percentOf(cents(1000), -1)).toThrow(MoneyError)
    expect(() => percentOf(cents(1000), 10.5)).toThrow(MoneyError)
  })

  it('takes the minimum', () => {
    expect(minCents(cents(1500), cents(9000))).toBe(1500)
  })
})

describe('formatSgd()', () => {
  it('renders whole amounts without cents, as the catalogue does', () => {
    expect(formatSgd(cents(3500))).toBe('S$35')
    expect(formatSgd(cents(9000))).toBe('S$90')
    expect(formatSgd(cents(20000))).toBe('S$200')
    expect(formatSgd(cents(55000))).toBe('S$550')
  })

  it('renders partial amounts with cents', () => {
    expect(formatSgd(cents(11050))).toBe('S$110.50')
    expect(formatSgd(cents(5))).toBe('S$0.05')
  })

  it('can be forced to always show cents', () => {
    expect(formatSgd(cents(3500), { alwaysCents: true })).toBe('S$35.00')
  })

  it('groups thousands', () => {
    expect(formatSgd(cents(123456))).toBe('S$1,234.56')
  })

  it('renders negatives for refunds', () => {
    expect(formatSgd(cents(-2000))).toBe('-S$20')
  })
})

describe('provider decimal strings', () => {
  it('round-trips', () => {
    expect(toDecimalString(cents(11000))).toBe('110.00')
    expect(toDecimalString(cents(3500))).toBe('35.00')
    expect(toDecimalString(cents(5))).toBe('0.05')
    expect(centsFromDecimalString('110.00')).toBe(11000)
    expect(centsFromDecimalString('35')).toBe(3500)
    expect(centsFromDecimalString('0.05')).toBe(5)
  })

  it('rejects malformed provider amounts', () => {
    expect(() => centsFromDecimalString('110.000')).toThrow(MoneyError)
    expect(() => centsFromDecimalString('abc')).toThrow(MoneyError)
    expect(() => centsFromDecimalString('')).toThrow(MoneyError)
  })
})

describe('the Cents brand (compile-time)', () => {
  it('refuses a plain number where Cents is required', () => {
    // These assertions are checked by `tsc --noEmit`, not at runtime.
    // If the brand is ever removed, @ts-expect-error becomes an unused
    // directive and the typecheck FAILS — which is the point.

    // @ts-expect-error a plain number is not Cents
    const bad: import('@/lib/money').Cents = 3500
    void bad

    // @ts-expect-error dollars cannot be passed where cents are expected
    void formatSgd(35)

    const good = cents(3500)
    expect(formatSgd(good)).toBe('S$35')
  })
})
