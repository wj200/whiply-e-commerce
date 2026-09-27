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

  it('returns exactly the finalised catalogue at the published prices', async () => {
    await seedLaunchCatalogue()
    const { listActiveProducts } = await import('@/lib/domain/products')
    const products = await listActiveProducts()

    // The published price list, in one assertion. If a price moves without
    // this changing, the storefront and the price list have diverged.
    expect(products.map((p) => [p.sku, p.priceCents])).toEqual([
      ['WHP-N2O-640-1', 4000],
      ['WHP-N2O-640-6', 19000],
      ['WHP-N2O-640-12', 35000],
      ['WHP-N2O-2500-1', 12000],
      ['WHP-N2O-2500-2', 22000],
      ['WHP-N2O-2500-4', 40000],
      ['WHP-CR-POWDER-250', 2500],
      ['WHP-CR-SPRAY', 2000],
      ['WHP-CR-FRESH-250', 1000],
      ['WHP-CR-NESTLE-250', 1000],
      ['WHP-EQ-DISPENSER', 15000],
      ['WHP-EQ-SCALE', 14000],
      ['WHP-EQ-MIXER', 60000],
    ])
  })

  it('records how many tanks a pack contains, and counts stock in PACKS', async () => {
    await seedLaunchCatalogue()
    const twelve = await db.product.findUniqueOrThrow({ where: { sku: 'WHP-N2O-640-12' } })
    expect(twelve.unitsPerPack).toBe(12)
    // Twenty BOXES, not twenty tanks. Counting units in one pool is how you
    // sell the last twelve-pack to someone who bought the last two singles.
    expect(twelve.stockQty).toBe(20)
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
      'WHP-N2O-640-1',
      'WHP-N2O-640-6',
      'WHP-N2O-640-12',
      'WHP-N2O-2500-1',
      'WHP-N2O-2500-2',
      'WHP-N2O-2500-4',
    ])
    expect((await listByCategory('CREAM_PRODUCTS')).map((p) => p.sku)).toEqual([
      'WHP-CR-POWDER-250',
      'WHP-CR-SPRAY',
      'WHP-CR-FRESH-250',
      'WHP-CR-NESTLE-250',
    ])
    expect((await listByCategory('BAKING_EQUIPMENT')).map((p) => p.sku)).toEqual([
      'WHP-EQ-DISPENSER',
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

/**
 * The constraints added with the Stripe/slot migration. Each one exists
 * because the application could get it wrong and the database should not
 * let it.
 */
describe('database invariants — slots, packs and seasons', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('refuses a pack of zero units', async () => {
    const p = await makeProduct()
    await expect(
      db.product.update({ where: { id: p.id }, data: { unitsPerPack: 0 } }),
    ).rejects.toThrow(/products_units_per_pack_positive/)
  })

  it('refuses HALF a delivery slot — both ends, or neither', async () => {
    await expect(
      db.$executeRawUnsafe(`
        INSERT INTO orders (id, reference, order_status, subtotal_cents, delivery_cents_placeholder)
        VALUES (gen_random_uuid(), 'WHP-00000000-AAAAA', 'PENDING_PAYMENT', 0, 0)
      `),
    ).rejects.toThrow()

    // The real shape: an otherwise valid order with only a start time.
    await expect(
      db.$executeRawUnsafe(`
        INSERT INTO orders (id, reference, order_status, subtotal_cents, discount_cents,
                            delivery_fee_cents, total_cents, delivery_slot_start,
                            contact_name, contact_email, contact_phone, address_line1,
                            postal_code, normalised_email, normalised_phone, updated_at)
        VALUES (gen_random_uuid(), 'WHP-00000000-BBBBB', 'PENDING_PAYMENT', 1000, 0,
                1000, 2000, now() + interval '2 hours',
                'A', 'a@b.c', '+6591234567', 'Road', '123456', 'a@b.c', '+6591234567', now())
      `),
    ).rejects.toThrow(/orders_slot_paired/)
  })

  it('refuses a slot that ends before it starts', async () => {
    await expect(
      db.$executeRawUnsafe(`
        INSERT INTO orders (id, reference, order_status, subtotal_cents, discount_cents,
                            delivery_fee_cents, total_cents, delivery_slot_start, delivery_slot_end,
                            contact_name, contact_email, contact_phone, address_line1,
                            postal_code, normalised_email, normalised_phone, updated_at)
        VALUES (gen_random_uuid(), 'WHP-00000000-CCCCC', 'PENDING_PAYMENT', 1000, 0,
                1000, 2000, now() + interval '3 hours', now() + interval '2 hours',
                'A', 'a@b.c', '+6591234567', 'Road', '123456', 'a@b.c', '+6591234567', now())
      `),
    ).rejects.toThrow(/orders_slot_paired/)
  })

  it('refuses a SEASONAL code missing either end of its window', async () => {
    for (const [starts, expires] of [
      ["now()", 'NULL'],
      ['NULL', "now() + interval '30 days'"],
      ['NULL', 'NULL'],
    ]) {
      await expect(
        db.$executeRawUnsafe(`
          INSERT INTO discount_codes (id, code, value_type, percent_off, limit_type,
                                      starts_at, expires_at, uses_count, is_active, updated_at)
          VALUES (gen_random_uuid(), 'SEASON${Math.random().toString(36).slice(2, 7).toUpperCase()}',
                  'PERCENT', 10, 'SEASONAL', ${starts}, ${expires}, 0, true, now())
        `),
      ).rejects.toThrow(/discount_codes_limit_shape/)
    }
  })

  it('refuses a SEASONAL window that closes before it opens', async () => {
    await expect(
      db.$executeRawUnsafe(`
        INSERT INTO discount_codes (id, code, value_type, percent_off, limit_type,
                                    starts_at, expires_at, uses_count, is_active, updated_at)
        VALUES (gen_random_uuid(), 'BACKWARDS', 'PERCENT', 10, 'SEASONAL',
                now() + interval '30 days', now(), 0, true, now())
      `),
    ).rejects.toThrow(/discount_codes_limit_shape/)
  })

  it('ACCEPTS a well-formed seasonal code', async () => {
    await expect(
      db.$executeRawUnsafe(`
        INSERT INTO discount_codes (id, code, value_type, percent_off, limit_type,
                                    starts_at, expires_at, season_label, uses_count,
                                    is_active, updated_at)
        VALUES (gen_random_uuid(), 'XMAS26', 'PERCENT', 10, 'SEASONAL',
                now(), now() + interval '30 days', 'Christmas 2026', 0, true, now())
      `),
    ).resolves.toBeDefined()
  })
})
