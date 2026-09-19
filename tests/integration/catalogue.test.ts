import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { db, resetDatabase, seedSettings, seedLaunchCatalogue, makeProduct } from './helpers'

/** Milestone A1 — the product read layer. */
describe('catalogue (A1)', () => {
  beforeEach(async () => {
    await resetDatabase()
    await seedSettings()
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it('returns exactly the four launch SKUs at the agreed prices', async () => {
    await seedLaunchCatalogue()
    const { listActiveProducts } = await import('@/lib/domain/products')
    const products = await listActiveProducts()

    expect(products).toHaveLength(4)
    expect(products.map((p) => [p.sku, p.priceCents])).toEqual([
      ['WHP-N2O-640', 3500],
      ['WHP-N2O-2000', 9000], // §4.2 — S$90 treated as authoritative
      ['WHP-EQ-SCALE', 20000],
      ['WHP-EQ-MIXER', 55000],
    ])
  })

  it('EXCLUDES a disabled product from every storefront query', async () => {
    await seedLaunchCatalogue()
    await db.product.update({
      where: { sku: 'WHP-EQ-MIXER' },
      data: { isActive: false },
    })

    const { listActiveProducts, listByCategory, getProductBySlug, listAllSlugs } = await import(
      '@/lib/domain/products'
    )

    expect((await listActiveProducts()).map((p) => p.sku)).not.toContain('WHP-EQ-MIXER')
    expect((await listByCategory('BAKING_EQUIPMENT')).map((p) => p.sku)).not.toContain(
      'WHP-EQ-MIXER',
    )
    expect(await getProductBySlug('industrial-grade-professional-mixer')).toBeNull()
    expect(await listAllSlugs()).not.toContain('industrial-grade-professional-mixer')
  })

  it('splits the catalogue by category', async () => {
    await seedLaunchCatalogue()
    const { listByCategory } = await import('@/lib/domain/products')
    expect((await listByCategory('CREAM_CHARGERS')).map((p) => p.sku)).toEqual([
      'WHP-N2O-640',
      'WHP-N2O-2000',
    ])
    expect((await listByCategory('BAKING_EQUIPMENT')).map((p) => p.sku)).toEqual([
      'WHP-EQ-SCALE',
      'WHP-EQ-MIXER',
    ])
  })

  it('marks a zero-stock product out of stock but still lists it', async () => {
    await makeProduct({ sku: 'SOLD-OUT', stockQty: 0 })
    const { listActiveProducts } = await import('@/lib/domain/products')
    const products = await listActiveProducts()
    const soldOut = products.find((p) => p.sku === 'SOLD-OUT')
    expect(soldOut?.inStock).toBe(false)
    expect(soldOut).toBeDefined()
  })

  it('tolerates a malformed specs column rather than crashing the page', async () => {
    const p = await makeProduct({ sku: 'BAD-SPECS' })
    await db.$executeRawUnsafe(
      `UPDATE products SET specs = '["not an object", {"label": 1}]'::jsonb WHERE id = $1::uuid`,
      p.id,
    )
    const { getProductBySlug } = await import('@/lib/domain/products')
    const loaded = await getProductBySlug('bad-specs')
    expect(loaded?.specs).toEqual([])
  })
})

/** Milestone M0.2 — the invariants must be the DATABASE's, not the app's. */
describe('database invariants (M0.2)', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('refuses negative stock', async () => {
    const p = await makeProduct({ stockQty: 1 })
    await expect(
      db.product.update({ where: { id: p.id }, data: { stockQty: -1 } }),
    ).rejects.toThrow(/products_stock_non_negative/)
  })

  it('refuses a discount code that is both time- and use-limited', async () => {
    await expect(
      db.$executeRawUnsafe(`
        INSERT INTO discount_codes (id, code, value_type, percent_off, limit_type,
                                    expires_at, max_uses, uses_count, is_active, updated_at)
        VALUES (gen_random_uuid(), 'BOTH10', 'PERCENT', 10, 'TIME_LIMITED',
                now() + interval '7 days', 5, 0, true, now())
      `),
    ).rejects.toThrow(/discount_codes_limit_shape/)
  })

  it('refuses a PERCENT code carrying a fixed value', async () => {
    await expect(
      db.$executeRawUnsafe(`
        INSERT INTO discount_codes (id, code, value_type, percent_off, value_cents, limit_type,
                                    max_uses, uses_count, is_active, updated_at)
        VALUES (gen_random_uuid(), 'MIXED', 'PERCENT', 10, 500, 'USE_LIMITED', 5, 0, true, now())
      `),
    ).rejects.toThrow(/discount_codes_value_shape/)
  })

  it('refuses a lowercase code', async () => {
    await expect(
      db.$executeRawUnsafe(`
        INSERT INTO discount_codes (id, code, value_type, percent_off, limit_type,
                                    max_uses, uses_count, is_active, updated_at)
        VALUES (gen_random_uuid(), 'welcome10', 'PERCENT', 10, 'USE_LIMITED', 5, 0, true, now())
      `),
    ).rejects.toThrow(/discount_codes_code_uppercase/)
  })
})
