import { PrismaClient } from '@/lib/generated/prisma'
import { SETTING_DEFAULTS, SETTING_KEYS } from '@/lib/domain/settings-schema'

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
  category: 'CREAM_CHARGERS' | 'BAKING_EQUIPMENT'
  priceCents: number
  stockQty: number
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
      priceCents: overrides.priceCents ?? 3500,
      stockQty: overrides.stockQty ?? 10,
      isActive: overrides.isActive ?? true,
      sortOrder: overrides.sortOrder ?? seq,
    },
  })
}

/** The four real SKUs at their real prices, for tests that assert the catalogue. */
export async function seedLaunchCatalogue() {
  await makeProduct({
    sku: 'WHP-N2O-640',
    slug: 'food-grade-n2o-cream-charger-1l-640g',
    name: 'Food-Grade N₂O Cream Charger — 1L / 640g',
    category: 'CREAM_CHARGERS',
    priceCents: 3500,
    stockQty: 120,
    sortOrder: 10,
  })
  await makeProduct({
    sku: 'WHP-N2O-2000',
    slug: 'food-grade-n2o-cream-charger-3-3l-2000g',
    name: 'Food-Grade N₂O Cream Charger — 3.3L / 2,000g',
    category: 'CREAM_CHARGERS',
    priceCents: 9000,
    stockQty: 60,
    sortOrder: 20,
  })
  await makeProduct({
    sku: 'WHP-EQ-SCALE',
    slug: 'precision-digital-weighing-scale',
    name: 'Precision Digital Weighing Scale',
    category: 'BAKING_EQUIPMENT',
    priceCents: 20000,
    stockQty: 15,
    sortOrder: 30,
  })
  await makeProduct({
    sku: 'WHP-EQ-MIXER',
    slug: 'industrial-grade-professional-mixer',
    name: 'Industrial-Grade Professional Mixer',
    category: 'BAKING_EQUIPMENT',
    priceCents: 55000,
    stockQty: 8,
    sortOrder: 40,
  })
}

type CodeOverrides = Partial<{
  code: string
  valueType: 'PERCENT' | 'FIXED'
  percentOff: number | null
  valueCents: number | null
  limitType: 'TIME_LIMITED' | 'USE_LIMITED'
  startsAt: Date | null
  expiresAt: Date | null
  maxUses: number | null
  usesCount: number
  attributionLabel: string | null
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
      startsAt: overrides.startsAt ?? null,
      expiresAt:
        limitType === 'TIME_LIMITED'
          ? (overrides.expiresAt ?? new Date(Date.now() + 7 * 24 * 3600 * 1000))
          : null,
      maxUses: limitType === 'USE_LIMITED' ? (overrides.maxUses ?? 5) : null,
      usesCount: overrides.usesCount ?? 0,
      attributionLabel: overrides.attributionLabel ?? null,
      isActive: overrides.isActive ?? true,
    },
  })
}
