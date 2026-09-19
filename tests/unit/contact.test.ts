import { describe, it, expect } from 'vitest'
import {
  normalisePhone,
  normaliseEmail,
  checkoutContactSchema,
} from '@/lib/domain/contact'
import { generateReference, isValidReference } from '@/lib/domain/reference'

describe('normalisePhone (Singapore mobile)', () => {
  it('accepts the common forms and normalises to E.164', () => {
    expect(normalisePhone('91234567')).toBe('+6591234567')
    expect(normalisePhone('9123 4567')).toBe('+6591234567')
    expect(normalisePhone('+65 9123 4567')).toBe('+6591234567')
    expect(normalisePhone('+6591234567')).toBe('+6591234567')
    expect(normalisePhone('65-9123-4567')).toBe('+6591234567')
    expect(normalisePhone('  81234567 ')).toBe('+6581234567')
  })

  it('rejects landlines and malformed numbers', () => {
    expect(normalisePhone('61234567')).toBeNull() // landline
    expect(normalisePhone('71234567')).toBeNull()
    expect(normalisePhone('9123456')).toBeNull() // too short
    expect(normalisePhone('912345678')).toBeNull() // too long
    expect(normalisePhone('abcdefgh')).toBeNull()
    expect(normalisePhone('')).toBeNull()
  })
})

describe('normaliseEmail', () => {
  it('lowercases and trims for the derived customer view', () => {
    expect(normaliseEmail('  Baker@Example.COM ')).toBe('baker@example.com')
  })
})

describe('checkoutContactSchema', () => {
  const valid = {
    name: 'Jane Baker',
    email: 'jane@example.com',
    phone: '9123 4567',
    addressLine1: '12 Kitchen Road',
    addressLine2: '#04-05',
    postalCode: '123456',
    instructions: 'Leave with the concierge',
  }

  it('accepts a complete address', () => {
    expect(checkoutContactSchema.safeParse(valid).success).toBe(true)
  })

  it('requires a 6-digit postal code', () => {
    for (const postalCode of ['12345', '1234567', 'ABC123', '']) {
      expect(checkoutContactSchema.safeParse({ ...valid, postalCode }).success).toBe(false)
    }
  })

  it('requires a name, email, phone and address line 1', () => {
    expect(checkoutContactSchema.safeParse({ ...valid, name: 'J' }).success).toBe(false)
    expect(checkoutContactSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false)
    expect(checkoutContactSchema.safeParse({ ...valid, phone: '61234567' }).success).toBe(false)
    expect(checkoutContactSchema.safeParse({ ...valid, addressLine1: '' }).success).toBe(false)
  })

  it('allows line 2 and instructions to be absent', () => {
    const { addressLine2: _a, instructions: _i, ...minimal } = valid
    expect(checkoutContactSchema.safeParse(minimal).success).toBe(true)
  })

  it('caps delivery instructions at 280 characters', () => {
    expect(
      checkoutContactSchema.safeParse({ ...valid, instructions: 'x'.repeat(281) }).success,
    ).toBe(false)
  })

  it('HAS NO self-collection or delivery-method field at all', () => {
    const keys = Object.keys(checkoutContactSchema.shape)
    expect(keys).not.toContain('deliveryMethod')
    expect(keys).not.toContain('selfCollection')
    expect(keys).not.toContain('pickup')
    // The address is mandatory, so no order can exist without one.
    expect(keys).toContain('addressLine1')
    expect(keys).toContain('postalCode')
  })
})

describe('order references', () => {
  it('matches the documented format', () => {
    const ref = generateReference(new Date('2026-09-19T00:00:00Z'))
    expect(ref).toMatch(/^WHP-20260919-[0-9A-HJKMNP-TV-Z]{5}$/)
    expect(isValidReference(ref)).toBe(true)
  })

  it('uses no ambiguous characters (I, L, O, U)', () => {
    for (let i = 0; i < 2000; i += 1) {
      const suffix = generateReference().split('-')[2]!
      expect(suffix).not.toMatch(/[ILOU]/)
    }
  })

  it('generates 100,000 unique references', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 100_000; i += 1) seen.add(generateReference())
    // 32^5 = 33.5M per day; collisions at 100k are possible but must be rare.
    expect(seen.size).toBeGreaterThan(99_800)
  })

  it('rejects malformed references', () => {
    expect(isValidReference('WHP-2026919-ABCDE')).toBe(false)
    expect(isValidReference('XXX-20260919-ABCDE')).toBe(false)
    expect(isValidReference('WHP-20260919-ABCDEF')).toBe(false)
    expect(isValidReference('WHP-20260919-ABCDI')).toBe(false)
  })
})
