import { describe, it, expect } from 'vitest'
import {
  computeTotals,
  assertBasketInvariants,
  type PriceableProduct,
  type PriceableCode,
  type PricingSettings,
} from '@/lib/domain/pricing'

const SETTINGS: PricingSettings = {
  deliveryFeeCents: 2000,
  freeDeliveryThresholdCents: 20000,
}

function product(over: Partial<PriceableProduct> = {}): PriceableProduct {
  return {
    id: over.id ?? 'p1',
    sku: over.sku ?? 'WHP-N2O-640',
    name: over.name ?? '1L charger',
    slug: over.slug ?? 'charger-1l',
    priceCents: over.priceCents ?? 3500,
    imageUrl: null,
    stockQty: over.stockQty ?? 100,
    isActive: over.isActive ?? true,
  }
}

const CHARGER_1L = product({ id: 'a', sku: 'WHP-N2O-640', priceCents: 3500 })
const CHARGER_3L = product({ id: 'b', sku: 'WHP-N2O-2000', priceCents: 9000 })
const SCALE = product({ id: 'c', sku: 'WHP-EQ-SCALE', priceCents: 20000 })
const MIXER = product({ id: 'd', sku: 'WHP-EQ-MIXER', priceCents: 55000 })

const PCT = (n: number): PriceableCode => ({
  id: 'code-pct',
  code: `SAVE${n}`,
  valueType: 'PERCENT',
  percentOff: n,
  valueCents: null,
})

const FIXED = (c: number): PriceableCode => ({
  id: 'code-fixed',
  code: 'FLAT',
  valueType: 'FIXED',
  percentOff: null,
  valueCents: c,
})

function price(
  lines: { product: PriceableProduct; qty: number }[],
  code: PriceableCode | null = null,
  settings: PricingSettings = SETTINGS,
) {
  const basket = computeTotals({ lines, code, settings })
  assertBasketInvariants(basket)
  return basket
}

describe('computeTotals — line arithmetic', () => {
  it('prices an empty basket as zero, with no delivery fee', () => {
    const b = price([])
    expect(b.subtotalCents).toBe(0)
    expect(b.deliveryFeeCents).toBe(0)
    expect(b.totalCents).toBe(0)
  })

  it('prices one line', () => {
    const b = price([{ product: CHARGER_1L, qty: 1 }])
    expect(b.subtotalCents).toBe(3500)
    expect(b.lines[0]!.lineTotalCents).toBe(3500)
  })

  it('multiplies by quantity', () => {
    const b = price([{ product: CHARGER_1L, qty: 3 }])
    expect(b.lines[0]!.lineTotalCents).toBe(10500)
    expect(b.subtotalCents).toBe(10500)
  })

  it('sums many lines', () => {
    const b = price([
      { product: CHARGER_1L, qty: 2 },
      { product: CHARGER_3L, qty: 1 },
    ])
    expect(b.subtotalCents).toBe(7000 + 9000)
  })
})

describe('computeTotals — the specification worked examples (§5.3)', () => {
  it('S$90 product + S$20 delivery = S$110', () => {
    const b = price([{ product: CHARGER_3L, qty: 1 }])
    expect(b.subtotalCents).toBe(9000)
    expect(b.deliveryFeeCents).toBe(2000)
    expect(b.totalCents).toBe(11000)
  })

  it('S$200 product + S$0 delivery = S$200', () => {
    const b = price([{ product: SCALE, qty: 1 }])
    expect(b.subtotalCents).toBe(20000)
    expect(b.deliveryFeeCents).toBe(0)
    expect(b.freeDeliveryApplied).toBe(true)
    expect(b.totalCents).toBe(20000)
  })
})

describe('computeTotals — the free-delivery threshold', () => {
  it('is free EXACTLY AT the threshold', () => {
    const b = price([{ product: SCALE, qty: 1 }])
    expect(b.deliveryFeeCents).toBe(0)
  })

  it('charges the fee ONE CENT below the threshold', () => {
    const b = price([{ product: product({ priceCents: 19999 }), qty: 1 }])
    expect(b.deliveryFeeCents).toBe(2000)
    expect(b.totalCents).toBe(21999)
  })

  it('reports how far the customer is from free delivery', () => {
    const b = price([{ product: CHARGER_3L, qty: 1 }])
    expect(b.amountToFreeDeliveryCents).toBe(11000)
  })

  it('reports zero remaining once free delivery applies', () => {
    const b = price([{ product: MIXER, qty: 1 }])
    expect(b.amountToFreeDeliveryCents).toBe(0)
  })

  it('follows the settings, not a constant', () => {
    const b = price([{ product: CHARGER_3L, qty: 1 }], null, {
      deliveryFeeCents: 1500,
      freeDeliveryThresholdCents: 5000,
    })
    expect(b.deliveryFeeCents).toBe(0)
    expect(b.totalCents).toBe(9000)
  })
})

describe('computeTotals — discounts', () => {
  it('applies a percentage to the subtotal', () => {
    const b = price([{ product: CHARGER_3L, qty: 1 }], PCT(10))
    expect(b.discountCents).toBe(900)
    expect(b.totalCents).toBe(9000 - 900 + 2000)
  })

  it('applies a fixed amount', () => {
    const b = price([{ product: CHARGER_3L, qty: 1 }], FIXED(1500))
    expect(b.discountCents).toBe(1500)
    expect(b.totalCents).toBe(9000 - 1500 + 2000)
  })

  it('CLAMPS a fixed code larger than the basket — total never goes below zero', () => {
    const b = price([{ product: CHARGER_1L, qty: 1 }], FIXED(999999))
    expect(b.discountCents).toBe(3500)
    expect(b.subtotalCents - b.discountCents).toBe(0)
    expect(b.totalCents).toBe(2000) // delivery still applies to a zero-value basket
    expect(b.totalCents).toBeGreaterThanOrEqual(0)
  })

  it('rounds an odd percentage DOWN, in the customer’s favour', () => {
    const b = price([{ product: product({ priceCents: 3533 }), qty: 1 }], PCT(10))
    expect(b.discountCents).toBe(353)
  })

  it('reports which code was applied', () => {
    const b = price([{ product: CHARGER_1L, qty: 1 }], PCT(10))
    expect(b.appliedCode).toEqual({ id: 'code-pct', code: 'SAVE10' })
  })

  it('ignores a malformed code rather than crashing checkout', () => {
    const broken: PriceableCode = {
      id: 'x',
      code: 'BROKEN',
      valueType: 'PERCENT',
      percentOff: null,
      valueCents: null,
    }
    const b = price([{ product: CHARGER_1L, qty: 1 }], broken)
    expect(b.discountCents).toBe(0)
  })
})

describe('computeTotals — THE ORDERING DECISION (§5.2)', () => {
  it('a S$210 basket pushed below S$200 by a 10% code PAYS the delivery fee', () => {
    const b = price([{ product: product({ priceCents: 21000 }), qty: 1 }], PCT(10))
    expect(b.subtotalCents).toBe(21000)
    expect(b.discountCents).toBe(2100)
    expect(b.subtotalCents - b.discountCents).toBe(18900)
    expect(b.freeDeliveryApplied).toBe(false)
    expect(b.deliveryFeeCents).toBe(2000)
    expect(b.totalCents).toBe(20900) // S$209
  })

  it('a basket still above the threshold after a code keeps free delivery', () => {
    const b = price([{ product: MIXER, qty: 1 }], PCT(10))
    expect(b.subtotalCents - b.discountCents).toBe(49500)
    expect(b.deliveryFeeCents).toBe(0)
    expect(b.totalCents).toBe(49500)
  })
})

describe('computeTotals — invariants hold for every combination', () => {
  const prices = [1, 99, 3500, 9000, 19999, 20000, 20001, 55000]
  const quantities = [1, 2, 7, 99]
  const codes: (PriceableCode | null)[] = [null, PCT(1), PCT(10), PCT(100), FIXED(1), FIXED(500000)]
  const settingsList: PricingSettings[] = [
    SETTINGS,
    { deliveryFeeCents: 0, freeDeliveryThresholdCents: 0 },
    { deliveryFeeCents: 9999, freeDeliveryThresholdCents: 1000000 },
  ]

  it('total = subtotal - discount + delivery, discount <= subtotal, total >= 0', () => {
    let checked = 0
    for (const p of prices) {
      for (const q of quantities) {
        for (const code of codes) {
          for (const settings of settingsList) {
            const b = computeTotals({
              lines: [{ product: product({ priceCents: p }), qty: q }],
              code,
              settings,
            })
            expect(b.totalCents).toBe(b.subtotalCents - b.discountCents + b.deliveryFeeCents)
            expect(b.discountCents).toBeLessThanOrEqual(b.subtotalCents)
            expect(b.totalCents).toBeGreaterThanOrEqual(0)
            expect(Number.isInteger(b.totalCents)).toBe(true)
            checked += 1
          }
        }
      }
    }
    expect(checked).toBe(prices.length * quantities.length * codes.length * settingsList.length)
  })
})
