import { PrismaClient } from '@/lib/generated/prisma'
import { SETTING_DEFAULTS, SETTING_KEYS } from '@/lib/domain/settings-schema'
import { availableSlots } from '@/lib/domain/delivery-slots'

export const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
})

/** Wipe everything between tests, in FK-safe order. */
export async function resetDatabase(): Promise<void> {
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE
      audit_log, order_events, webhook_events, discount_redemptions,
      deliveries, payments, order_items, orders, discount_codes,
      enquiries, products, settings, admin_users
    RESTART IDENTITY CASCADE
  `)
}

export async function seedSettings(
  overrides: Partial<Record<(typeof SETTING_KEYS)[number], unknown>> = {},
): Promise<void> {
  for (const key of SETTING_KEYS) {
    const value = key in overrides ? overrides[key] : SETTING_DEFAULTS[key]
    await db.setting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    })
  }
}

type ProductOverrides = Partial<{
  sku: string
  slug: string
  name: string
  category: 'CREAM_CHARGERS' | 'CREAM_PRODUCTS' | 'BAKING_EQUIPMENT'
  priceCents: number
  stockQty: number
  unitsPerPack: number
  isActive: boolean
  sortOrder: number
}>

let seq = 0

export async function makeProduct(overrides: ProductOverrides = {}) {
  seq += 1
  const sku = overrides.sku ?? `TEST-SKU-${seq}`
  return db.product.create({
    data: {
      sku,
      slug: overrides.slug ?? sku.toLowerCase(),
      name: overrides.name ?? `Test product ${seq}`,
      category: overrides.category ?? 'CREAM_CHARGERS',
      shortDesc: 'Short description',
      description: 'Full description',
      specs: [{ label: 'Capacity', value: '1 L' }],
      priceCents: overrides.priceCents ?? 4000,
      stockQty: overrides.stockQty ?? 10,
      unitsPerPack: overrides.unitsPerPack ?? 1,
      isActive: overrides.isActive ?? true,
      sortOrder: overrides.sortOrder ?? seq,
    },
  })
}

/**
 * The finalised catalogue at its published prices, for tests that assert the
 * price list rather than arbitrary numbers. Pack sizes are separate SKUs
 * carrying `unitsPerPack`, and stock is counted in PACKS.
 */
export async function seedLaunchCatalogue() {
  const rows = [
    ['WHP-N2O-640-1', 'n2o-cream-charger-640g-single', '640g N₂O Cream Charger — 1 Tank', 'CREAM_CHARGERS', 4000, 120, 1, 10],
    ['WHP-N2O-640-6', 'n2o-cream-charger-640g-6-pack', '640g N₂O Cream Charger — 6 Tanks', 'CREAM_CHARGERS', 19000, 40, 6, 11],
    ['WHP-N2O-640-12', 'n2o-cream-charger-640g-12-pack', '640g N₂O Cream Charger — 12 Tanks', 'CREAM_CHARGERS', 35000, 20, 12, 12],
    ['WHP-N2O-2500-1', 'n2o-cream-charger-2-5kg-single', '2.5kg N₂O Cream Charger — 1 Tank', 'CREAM_CHARGERS', 12000, 60, 1, 20],
    ['WHP-N2O-2500-2', 'n2o-cream-charger-2-5kg-2-pack', '2.5kg N₂O Cream Charger — 2 Tanks', 'CREAM_CHARGERS', 22000, 25, 2, 21],
    ['WHP-N2O-2500-4', 'n2o-cream-charger-2-5kg-4-pack', '2.5kg N₂O Cream Charger — 4 Tanks', 'CREAM_CHARGERS', 40000, 12, 4, 22],
    ['WHP-CR-POWDER-250', 'whipping-cream-powdered-250g', 'Whipping Cream — Powdered, 250g', 'CREAM_PRODUCTS', 2500, 80, 1, 30],
    ['WHP-CR-SPRAY', 'whipping-cream-spray', 'Whipping Cream — Spray', 'CREAM_PRODUCTS', 2000, 80, 1, 31],
    ['WHP-CR-FRESH-250', 'whipping-cream-250g', 'Whipping Cream — 250g', 'CREAM_PRODUCTS', 1000, 100, 1, 32],
    ['WHP-CR-NESTLE-250', 'nestle-all-purpose-cream-250g', 'Nestlé All Purpose Cream — 250g', 'CREAM_PRODUCTS', 1000, 100, 1, 33],
    ['WHP-EQ-DISPENSER', 'whipped-cream-dispenser-stainless-steel', 'Whipped Cream Dispenser — Stainless Steel', 'BAKING_EQUIPMENT', 15000, 20, 1, 40],
    ['WHP-EQ-SCALE', 'precision-digital-weighing-scale', 'Digital Precision Scale with Timer', 'BAKING_EQUIPMENT', 14000, 15, 1, 41],
    ['WHP-EQ-MIXER', 'industrial-grade-professional-mixer', 'Industrial Mixer', 'BAKING_EQUIPMENT', 60000, 8, 1, 42],
  ] as const

  for (const [sku, slug, name, category, priceCents, stockQty, unitsPerPack, sortOrder] of rows) {
    await makeProduct({ sku, slug, name, category, priceCents, stockQty, unitsPerPack, sortOrder })
  }
}

type CodeOverrides = Partial<{
  code: string
  valueType: 'PERCENT' | 'FIXED'
  percentOff: number | null
  valueCents: number | null
  limitType: 'TIME_LIMITED' | 'USE_LIMITED' | 'SEASONAL'
  startsAt: Date | null
  expiresAt: Date | null
  maxUses: number | null
  usesCount: number
  attributionLabel: string | null
  seasonLabel: string | null
  isActive: boolean
}>

export async function makeCode(overrides: CodeOverrides = {}) {
  const limitType = overrides.limitType ?? 'TIME_LIMITED'
  return db.discountCode.create({
    data: {
      code: overrides.code ?? 'WELCOME10',
      valueType: overrides.valueType ?? 'PERCENT',
      percentOff: overrides.valueType === 'FIXED' ? null : (overrides.percentOff ?? 10),
      valueCents: overrides.valueType === 'FIXED' ? (overrides.valueCents ?? 1500) : null,
      limitType,
      // The database CHECK insists a SEASONAL code carries BOTH ends of its
      // window; these defaults keep a test from having to know that.
      startsAt:
        limitType === 'SEASONAL'
          ? (overrides.startsAt ?? new Date(Date.now() - 24 * 3600 * 1000))
          : (overrides.startsAt ?? null),
      expiresAt:
        limitType === 'TIME_LIMITED' || limitType === 'SEASONAL'
          ? (overrides.expiresAt ?? new Date(Date.now() + 7 * 24 * 3600 * 1000))
          : null,
      maxUses: limitType === 'USE_LIMITED' ? (overrides.maxUses ?? 5) : null,
      usesCount: overrides.usesCount ?? 0,
      attributionLabel: overrides.attributionLabel ?? null,
      seasonLabel:
        limitType === 'SEASONAL' ? (overrides.seasonLabel ?? 'Test Season') : null,
      isActive: overrides.isActive ?? true,
    },
  })
}

/**
 * A slot that is legal right now. Tests that only need "some valid delivery"
 * should use this rather than inventing a timestamp, because the slot rules
 * are enforced server-side and an invented one is refused.
 */
export function aValidSlot(now = new Date()): { method: 'STANDARD'; start: Date; end: Date } {
  const slots = availableSlots({ method: 'STANDARD', now })
  const first = slots[0]
  if (!first) throw new Error('No standard slots available — check DEFAULT_SLOT_RULES')
  return { method: 'STANDARD', start: first.start, end: first.end }
}
