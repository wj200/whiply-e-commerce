import { describe, it, expect } from 'vitest'
import {
  canTransition,
  assertTransition,
  IllegalTransitionError,
  ALLOWED_TRANSITIONS,
  isTerminal,
} from '@/lib/domain/state-machine'
import type { OrderStatus } from '@/lib/generated/prisma'

const ALL = Object.keys(ALLOWED_TRANSITIONS) as OrderStatus[]

describe('order state machine (§19.2)', () => {
  it('allows the documented happy path', () => {
    const path: OrderStatus[] = [
      'PENDING_PAYMENT',
      'PAID',
      'PROCESSING',
      'READY_FOR_DELIVERY',
      'DELIVERY_BOOKED',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ]
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true)
    }
  })

  it('allows the dispatch-ON path that skips READY_FOR_DELIVERY', () => {
    expect(canTransition('PROCESSING', 'DELIVERY_BOOKED')).toBe(true)
  })

  it('REFUSES any return to PENDING_PAYMENT', () => {
    for (const from of ALL) {
      expect(canTransition(from, 'PENDING_PAYMENT')).toBe(false)
    }
  })

  it('REFUSES CANCELLED → PAID', () => {
    expect(canTransition('CANCELLED', 'PAID')).toBe(false)
  })

  it('REFUSES DELIVERED → OUT_FOR_DELIVERY — a late webhook cannot un-deliver', () => {
    expect(canTransition('DELIVERED', 'OUT_FOR_DELIVERY')).toBe(false)
  })

  it('REFUSES any path to DELIVERY_BOOKED that has not been PAID', () => {
    expect(canTransition('PENDING_PAYMENT', 'DELIVERY_BOOKED')).toBe(false)
    expect(canTransition('CANCELLED', 'DELIVERY_BOOKED')).toBe(false)
    expect(canTransition('REFUNDED', 'DELIVERY_BOOKED')).toBe(false)
  })

  it('treats CANCELLED and REFUNDED as terminal', () => {
    expect(ALLOWED_TRANSITIONS.CANCELLED).toEqual([])
    expect(ALLOWED_TRANSITIONS.REFUNDED).toEqual([])
    expect(isTerminal('CANCELLED')).toBe(true)
    expect(isTerminal('REFUNDED')).toBe(true)
    expect(isTerminal('PAID')).toBe(false)
  })

  it('allows a post-delivery refund', () => {
    expect(canTransition('DELIVERED', 'REFUNDED')).toBe(true)
  })

  it('never allows a self-transition', () => {
    for (const status of ALL) {
      expect(canTransition(status, status)).toBe(false)
    }
  })

  it('throws IllegalTransitionError with both states named', () => {
    expect(() => assertTransition('DELIVERED', 'PAID')).toThrow(IllegalTransitionError)
    expect(() => assertTransition('DELIVERED', 'PAID')).toThrow(/DELIVERED → PAID/)
  })

  it('enumerates every status — no status is missing from the table', () => {
    expect(ALL).toHaveLength(10)
    for (const status of ALL) {
      expect(Array.isArray(ALLOWED_TRANSITIONS[status])).toBe(true)
    }
  })
})
