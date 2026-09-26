import { describe, it, expect } from 'vitest'
import {
  computeTotals,
  assertBasketInvariants,
  type PriceableProduct,
  type PriceableCode,
  type PricingSettings,
} from '@/lib/domain/pricing'

/** The published price list: S$10 standard, S$20 express, free at S$200. */
const SETTINGS: PricingSettings = {
  standardDeliveryFeeCents: 1000,
  expressDeliveryFeeCents: 2000,
  freeDeliveryThresholdCents: 20000,
}

function product(over: Partial<PriceableProduct> = {}): PriceableProduct {
  return {
    id: over.id ?? 'p1',
    sku: over.sku ?? 'WHP-N2O-640-1',
    name: over.name ?? '640g charger',
    slug: over.slug ?? 'charger-640g',
    priceCents: over.priceCents ?? 4000,
    imageUrl: null,
    stockQty: over.stockQty ?? 100,
    isActive: over.isActive ?? true,
  }
}

const TANK_640 = product({ id: 'a', sku: 'WHP-N2O-640-1', priceCents: 4000 })
const PACK_640_6 = product({ id: 'b', sku: 'WHP-N2O-640-6', priceCents: 19000 })
const TANK_2500 = product({ id: 'c', sku: 'WHP-N2O-2500-1', priceCents: 12000 })
const MIXER = product({ id: 'e', sku: 'WHP-EQ-MIXER', priceCents: 60000 })
const AT_THRESHOLD = product({ id: 'f', sku: 'WHP-AT-200', priceCents: 20000 })

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
  deliveryMethod: 'STANDARD' | 'EXPRESS' = 'STANDARD',
) {
  const basket = computeTotals({ lines, code, settings, deliveryMethod })
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
    const b = price([{ product: TANK_640, qty: 1 }])
    expect(b.subtotalCents).toBe(4000)
    expect(b.lines[0]!.lineTotalCents).toBe(4000)
  })

  it('multiplies by quantity', () => {
    const b = price([{ product: TANK_640, qty: 3 }])
    expect(b.lines[0]!.lineTotalCents).toBe(12000)
    expect(b.subtotalCents).toBe(12000)
  })

  it('sums many lines', () => {
    const b = price([
      { product: TANK_640, qty: 2 },
      { product: TANK_2500, qty: 1 },
    ])
    expect(b.subtotalCents).toBe(8000 + 12000)
  })

  it('prices a PACK as its own SKU, not as N singles', () => {
    // Six tanks bought as a pack is S$190; six bought singly is S$240. If
    // this ever stops being true, the pack discount has been lost.
    const asPack = price([{ product: PACK_640_6, qty: 1 }])
    const asSingles = price([{ product: TANK_640, qty: 6 }])
    expect(asPack.subtotalCents).toBe(19000)
    expect(asSingles.subtotalCents).toBe(24000)
    expect(asPack.subtotalCents).toBeLessThan(asSingles.subtotalCents)
  })
})

describe('computeTotals — the published price list', () => {
  it('S$40 tank + S$10 standard delivery = S$50', () => {
    const b = price([{ product: TANK_640, qty: 1 }])
    expect(b.deliveryFeeCents).toBe(1000)
    expect(b.totalCents).toBe(5000)
  })

  it('S$40 tank + S$20 express delivery = S$60', () => {
    const b = price([{ product: TANK_640, qty: 1 }], null, SETTINGS, 'EXPRESS')
    expect(b.deliveryFeeCents).toBe(2000)
    expect(b.totalCents).toBe(6000)
  })

  it('S$200 order pays nothing for delivery at EITHER speed', () => {
    for (const method of ['STANDARD', 'EXPRESS'] as const) {
      const b = price([{ product: AT_THRESHOLD, qty: 1 }], null, SETTINGS, method)
      expect(b.deliveryFeeCents).toBe(0)
      expect(b.freeDeliveryApplied).toBe(true)
      expect(b.totalCents).toBe(20000)
    }
  })

  it('never makes the slower option cost MORE than the faster one', () => {
    // The published rule waives express above the threshold. Waiving only
    // express would leave a qualifying customer who picks standard as the
    // one person still paying — so both are waived, and this pins it.
    for (const p of [1000, 19999, 20000, 60000]) {
      const std = price([{ product: product({ priceCents: p }), qty: 1 }], null, SETTINGS, 'STANDARD')
      const exp = price([{ product: product({ priceCents: p }), qty: 1 }], null, SETTINGS, 'EXPRESS')
      expect(std.deliveryFeeCents).toBeLessThanOrEqual(exp.deliveryFeeCents)
    }
  })

  it('reports both fee rates so the UI never hard-codes them', () => {
    const b = price([{ product: TANK_640, qty: 1 }])
    expect(b.standardDeliveryFeeCents).toBe(1000)
    expect(b.expressDeliveryFeeCents).toBe(2000)
    expect(b.freeDeliveryThresholdCents).toBe(20000)
    expect(b.deliveryMethod).toBe('STANDARD')
  })
})

describe('computeTotals — the free-delivery threshold', () => {
  it('is free EXACTLY AT the threshold', () => {
    const b = price([{ product: AT_THRESHOLD, qty: 1 }])
    expect(b.deliveryFeeCents).toBe(0)
  })

  it('charges the fee ONE CENT below the threshold', () => {
    const b = price([{ product: product({ priceCents: 19999 }), qty: 1 }])
    expect(b.deliveryFeeCents).toBe(1000)
    expect(b.totalCents).toBe(20999)
  })

  it('reports how far the customer is from free delivery', () => {
    const b = price([{ product: TANK_2500, qty: 1 }])
    expect(b.amountToFreeDeliveryCents).toBe(8000)
  })

  it('reports zero remaining once free delivery applies', () => {
    const b = price([{ product: MIXER, qty: 1 }])
    expect(b.amountToFreeDeliveryCents).toBe(0)
  })

  it('follows the settings, not a constant', () => {
    const b = price([{ product: TANK_2500, qty: 1 }], null, {
      standardDeliveryFeeCents: 1500,
      expressDeliveryFeeCents: 3000,
      freeDeliveryThresholdCents: 5000,
    })
    expect(b.deliveryFeeCents).toBe(0)
    expect(b.totalCents).toBe(12000)
  })
})

describe('computeTotals — discounts', () => {
  it('applies a percentage to the subtotal', () => {
    const b = price([{ product: TANK_2500, qty: 1 }], PCT(10))
    expect(b.discountCents).toBe(1200)
    expect(b.totalCents).toBe(12000 - 1200 + 1000)
  })

  it('applies a fixed amount', () => {
    const b = price([{ product: TANK_2500, qty: 1 }], FIXED(1500))
    expect(b.discountCents).toBe(1500)
    expect(b.totalCents).toBe(12000 - 1500 + 1000)
  })

  it('CLAMPS a fixed code larger than the basket — total never goes below zero', () => {
    const b = price([{ product: TANK_640, qty: 1 }], FIXED(999999))
    expect(b.discountCents).toBe(4000)
    expect(b.subtotalCents - b.discountCents).toBe(0)
    expect(b.totalCents).toBe(1000) // delivery still applies to a zero-value basket
    expect(b.totalCents).toBeGreaterThanOrEqual(0)
  })

  it('rounds an odd percentage DOWN, in the customer’s favour', () => {
    const b = price([{ product: product({ priceCents: 3533 }), qty: 1 }], PCT(10))
    expect(b.discountCents).toBe(353)
  })

  it('reports which code was applied', () => {
    const b = price([{ product: TANK_640, qty: 1 }], PCT(10))
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
    const b = price([{ product: TANK_640, qty: 1 }], broken)
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
    expect(b.deliveryFeeCents).toBe(1000)
    expect(b.totalCents).toBe(19900) // S$199
  })

  it('a basket still above the threshold after a code keeps free delivery', () => {
    const b = price([{ product: MIXER, qty: 1 }], PCT(10))
    expect(b.subtotalCents - b.discountCents).toBe(54000)
    expect(b.deliveryFeeCents).toBe(0)
    expect(b.totalCents).toBe(54000)
  })
})

describe('computeTotals — invariants hold for every combination', () => {
  const prices = [1, 99, 4000, 12000, 19999, 20000, 20001, 60000]
  const quantities = [1, 2, 7, 99]
  const codes: (PriceableCode | null)[] = [null, PCT(1), PCT(10), PCT(100), FIXED(1), FIXED(500000)]
  const settingsList: PricingSettings[] = [
    SETTINGS,
    { standardDeliveryFeeCents: 0, expressDeliveryFeeCents: 0, freeDeliveryThresholdCents: 0 },
    {
      standardDeliveryFeeCents: 9999,
      expressDeliveryFeeCents: 19999,
      freeDeliveryThresholdCents: 1000000,
    },
  ]
  const methods = ['STANDARD', 'EXPRESS'] as const

  it('total = subtotal - discount + delivery, discount <= subtotal, total >= 0', () => {
    let checked = 0
    for (const p of prices) {
      for (const q of quantities) {
        for (const code of codes) {
          for (const settings of settingsList) {
            for (const deliveryMethod of methods) {
              const b = computeTotals({
                lines: [{ product: product({ priceCents: p }), qty: q }],
                code,
                settings,
                deliveryMethod,
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
    }
    expect(checked).toBe(
      prices.length * quantities.length * codes.length * settingsList.length * methods.length,
    )
  })
})
