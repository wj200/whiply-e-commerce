import { PrismaClient, ProductCategory } from '../lib/generated/prisma'
import { SETTING_DEFAULTS, SETTING_KEYS } from '../lib/domain/settings-schema'

const prisma = new PrismaClient()

/**
 * Blueprint §4.1 — the launch catalogue, at the finalised price list.
 *
 * Two things about the shape of this list are decisions, not conveniences:
 *
 *  1. EACH PACK SIZE IS ITS OWN SKU. A six-tank pack is not "the single, six
 *     times" — it has its own price, its own stock and its own margin, and
 *     modelling it as a quantity would make the discount at six tanks
 *     impossible to express. `unitsPerPack` records how many physical tanks
 *     a purchase represents, for stock counting and for the packing slip.
 *
 *  2. STOCK IS COUNTED IN PACKS. `stockQty` of 12 on the six-tank SKU means
 *     twelve boxes on the shelf, not twelve tanks. The alternative — one
 *     stock pool decremented by `unitsPerPack` — is how you oversell a
 *     twelve-pack to someone who bought the last two singles.
 *
 * After the first seed every field here is an admin-panel field, not a code
 * change (§4.5).
 */

const SAFETY_NOTE =
  'Pressurised container. Keep away from heat and direct sunlight. ' +
  'Use only with equipment rated for this cylinder. Follow the handling and ' +
  'storage instructions supplied with the product.'

function chargerSpecs(size: string, net: string, tanks: number) {
  return [
    { label: 'Cylinder', value: size },
    { label: 'Net weight', value: net },
    { label: 'Tanks per pack', value: String(tanks) },
    { label: 'Gas', value: 'Food-grade N₂O (nitrous oxide)' },
    { label: 'Intended use', value: 'Culinary cream whipping and baking preparation' },
    { label: 'Safety information', value: SAFETY_NOTE },
  ]
}

const CHARGER_DESC_640 =
  'Food-grade nitrous oxide (N₂O) in the 640 g cylinder, sized for professional kitchen ' +
  'use. Intended for culinary cream whipping and related preparations with a compatible ' +
  'whipped-cream dispenser. Store and handle according to the product safety information ' +
  'supplied with the cylinder.'

const CHARGER_DESC_2500 =
  'Food-grade nitrous oxide (N₂O) in the 2.5 kg cylinder, for kitchens working at volume. ' +
  'Intended for culinary cream whipping and related preparations with a compatible ' +
  'whipped-cream dispenser. Store and handle according to the product safety information ' +
  'supplied with the cylinder.'

const PRODUCTS = [
  // ── 640 g cream chargers ───────────────────────────────────────────
  {
    sku: 'WHP-N2O-640-1',
    slug: 'n2o-cream-charger-640g-single',
    name: '640g N₂O Cream Charger — 1 Tank',
    category: ProductCategory.CREAM_CHARGERS,
    cardLabel: 'A little extraordinary',
    shortDesc: '640 g · single tank · culinary use only',
    description: CHARGER_DESC_640,
    specs: chargerSpecs('640 g', '640 g', 1),
    unitsPerPack: 1,
    priceCents: 4000,
    stockQty: 120,
    lowStockAt: 20,
    sortOrder: 10,
    imageAlt: 'Food-grade 640 gram N₂O cream charger cylinder',
  },
  {
    sku: 'WHP-N2O-640-6',
    slug: 'n2o-cream-charger-640g-6-pack',
    name: '640g N₂O Cream Charger — 6 Tanks',
    category: ProductCategory.CREAM_CHARGERS,
    cardLabel: 'The service pack',
    shortDesc: '640 g × 6 · culinary use only',
    description: CHARGER_DESC_640,
    specs: chargerSpecs('640 g', '3.84 kg total', 6),
    unitsPerPack: 6,
    priceCents: 19000,
    stockQty: 40,
    lowStockAt: 6,
    sortOrder: 11,
    imageAlt: 'Six-pack of food-grade 640 gram N₂O cream chargers',
  },
  {
    sku: 'WHP-N2O-640-12',
    slug: 'n2o-cream-charger-640g-12-pack',
    name: '640g N₂O Cream Charger — 12 Tanks',
    category: ProductCategory.CREAM_CHARGERS,
    cardLabel: 'The full case',
    shortDesc: '640 g × 12 · culinary use only',
    description: CHARGER_DESC_640,
    specs: chargerSpecs('640 g', '7.68 kg total', 12),
    unitsPerPack: 12,
    priceCents: 35000,
    stockQty: 20,
    lowStockAt: 4,
    sortOrder: 12,
    imageAlt: 'Case of twelve food-grade 640 gram N₂O cream chargers',
  },

  // ── 2.5 kg cream chargers ──────────────────────────────────────────
  {
    sku: 'WHP-N2O-2500-1',
    slug: 'n2o-cream-charger-2-5kg-single',
    name: '2.5kg N₂O Cream Charger — 1 Tank',
    category: ProductCategory.CREAM_CHARGERS,
    cardLabel: 'More room to create',
    shortDesc: '2.5 kg · single tank · culinary use only',
    description: CHARGER_DESC_2500,
    specs: chargerSpecs('2.5 kg', '2.5 kg', 1),
    unitsPerPack: 1,
    priceCents: 12000,
    stockQty: 60,
    lowStockAt: 10,
    sortOrder: 20,
    imageAlt: 'Food-grade 2.5 kilogram N₂O cream charger cylinder',
  },
  {
    sku: 'WHP-N2O-2500-2',
    slug: 'n2o-cream-charger-2-5kg-2-pack',
    name: '2.5kg N₂O Cream Charger — 2 Tanks',
    category: ProductCategory.CREAM_CHARGERS,
    cardLabel: 'The pair',
    shortDesc: '2.5 kg × 2 · culinary use only',
    description: CHARGER_DESC_2500,
    specs: chargerSpecs('2.5 kg', '5 kg total', 2),
    unitsPerPack: 2,
    priceCents: 22000,
    stockQty: 25,
    lowStockAt: 5,
    sortOrder: 21,
    imageAlt: 'Two food-grade 2.5 kilogram N₂O cream charger cylinders',
  },
  {
    sku: 'WHP-N2O-2500-4',
    slug: 'n2o-cream-charger-2-5kg-4-pack',
    name: '2.5kg N₂O Cream Charger — 4 Tanks',
    category: ProductCategory.CREAM_CHARGERS,
    cardLabel: 'The volume case',
    shortDesc: '2.5 kg × 4 · culinary use only',
    description: CHARGER_DESC_2500,
    specs: chargerSpecs('2.5 kg', '10 kg total', 4),
    unitsPerPack: 4,
    priceCents: 40000,
    stockQty: 12,
    lowStockAt: 3,
    sortOrder: 22,
    imageAlt: 'Case of four food-grade 2.5 kilogram N₂O cream charger cylinders',
  },

  // ── Cream ──────────────────────────────────────────────────────────
  {
    sku: 'WHP-CR-POWDER-250',
    slug: 'whipping-cream-powdered-250g',
    name: 'Whipping Cream — Powdered, 250g',
    category: ProductCategory.CREAM_PRODUCTS,
    cardLabel: 'Shelf-stable',
    shortDesc: '250 g · powdered',
    description:
      'Powdered whipping cream in a 250 g pack. Reconstitutes for piping, filling and ' +
      'dispenser work, and keeps at ambient temperature — useful when fridge space is the ' +
      'constraint rather than budget.',
    specs: [
      { label: 'Format', value: 'Powder' },
      { label: 'Pack size', value: '250 g' },
      { label: 'Storage', value: 'Ambient, sealed' },
    ],
    unitsPerPack: 1,
    priceCents: 2500,
    stockQty: 80,
    lowStockAt: 12,
    sortOrder: 30,
    imageAlt: 'Pack of powdered whipping cream',
  },
  {
    sku: 'WHP-CR-SPRAY',
    slug: 'whipping-cream-spray',
    name: 'Whipping Cream — Spray',
    category: ProductCategory.CREAM_PRODUCTS,
    cardLabel: 'Ready to go',
    shortDesc: 'Aerosol · ready-whipped',
    description:
      'Ready-whipped cream in an aerosol can, for service where speed matters more than ' +
      'the peak. No dispenser or charger required.',
    specs: [
      { label: 'Format', value: 'Aerosol can' },
      { label: 'Storage', value: 'Chilled' },
    ],
    unitsPerPack: 1,
    priceCents: 2000,
    stockQty: 80,
    lowStockAt: 12,
    sortOrder: 31,
    imageAlt: 'Can of spray whipping cream',
  },
  {
    sku: 'WHP-CR-FRESH-250',
    slug: 'whipping-cream-250g',
    name: 'Whipping Cream — 250g',
    category: ProductCategory.CREAM_PRODUCTS,
    cardLabel: 'The classic',
    shortDesc: '250 g · chilled',
    description:
      'Whipping cream in a 250 g pack, for the dispenser or the bowl. Chilled storage; ' +
      'whip cold for the best structure.',
    specs: [
      { label: 'Format', value: 'Liquid' },
      { label: 'Pack size', value: '250 g' },
      { label: 'Storage', value: 'Chilled' },
    ],
    unitsPerPack: 1,
    priceCents: 1000,
    stockQty: 100,
    lowStockAt: 15,
    sortOrder: 32,
    imageAlt: 'Carton of whipping cream',
  },
  {
    sku: 'WHP-CR-NESTLE-250',
    slug: 'nestle-all-purpose-cream-250g',
    name: 'Nestlé All Purpose Cream — 250g',
    category: ProductCategory.CREAM_PRODUCTS,
    cardLabel: 'The workhorse',
    shortDesc: '250 g · all purpose',
    description:
      'Nestlé all purpose cream in a 250 g pack. Holds up in sauces and fillings as well ' +
      'as desserts, which is why most kitchens keep a case of it.',
    specs: [
      { label: 'Format', value: 'Liquid' },
      { label: 'Pack size', value: '250 g' },
      { label: 'Use', value: 'Sweet and savoury preparation' },
    ],
    unitsPerPack: 1,
    priceCents: 1000,
    stockQty: 100,
    lowStockAt: 15,
    sortOrder: 33,
    imageAlt: 'Pack of Nestlé all purpose cream',
  },

  // ── Equipment ──────────────────────────────────────────────────────
  {
    sku: 'WHP-EQ-DISPENSER',
    slug: 'whipped-cream-dispenser-stainless-steel',
    name: 'Whipped Cream Dispenser — Stainless Steel',
    category: ProductCategory.BAKING_EQUIPMENT,
    cardLabel: 'The instrument',
    shortDesc: 'Stainless steel · charger-compatible',
    description:
      'A stainless steel whipped-cream dispenser built for continuous service. Takes ' +
      'food-grade N₂O chargers; check the cylinder rating against the dispenser before ' +
      'first use.',
    specs: [
      { label: 'Material', value: 'Stainless steel' },
      { label: 'Use', value: 'Professional cream whipping' },
      { label: 'Compatibility', value: 'Food-grade N₂O chargers' },
    ],
    unitsPerPack: 1,
    priceCents: 15000,
    stockQty: 20,
    lowStockAt: 4,
    sortOrder: 40,
    imageAlt: 'Stainless steel whipped cream dispenser',
  },
  {
    sku: 'WHP-EQ-SCALE',
    slug: 'precision-digital-weighing-scale',
    name: 'Digital Precision Scale with Timer',
    category: ProductCategory.BAKING_EQUIPMENT,
    cardLabel: 'The essential',
    shortDesc: 'Measured to perfection.',
    description:
      'A precision digital weighing scale with a built-in timer, for bakery and pastry ' +
      'work where consistency depends on accurate measurement and accurate proving. ' +
      'Specifications reflect the supplier documentation for the current stock.',
    specs: [
      { label: 'Type', value: 'Digital precision bench scale' },
      { label: 'Features', value: 'Integrated timer' },
      { label: 'Use', value: 'Bakery and pastry measurement' },
    ],
    unitsPerPack: 1,
    priceCents: 14000,
    stockQty: 15,
    lowStockAt: 3,
    sortOrder: 41,
    imageAlt: 'Digital precision weighing scale on a clean kitchen work surface',
  },
  {
    sku: 'WHP-EQ-MIXER',
    slug: 'industrial-grade-professional-mixer',
    name: 'Industrial Mixer',
    category: ProductCategory.BAKING_EQUIPMENT,
    cardLabel: 'Built for more',
    shortDesc: 'Power behind every batch.',
    description:
      'An industrial-grade stand mixer intended for continuous professional kitchen use. ' +
      'Specifications reflect the supplier documentation for the current stock.',
    specs: [
      { label: 'Type', value: 'Professional stand mixer' },
      { label: 'Use', value: 'Continuous commercial bakery use' },
    ],
    unitsPerPack: 1,
    priceCents: 60000,
    stockQty: 8,
    lowStockAt: 2,
    sortOrder: 42,
    imageAlt: 'Industrial stand mixer in a professional bakery',
  },
]

async function main() {
  for (const p of PRODUCTS) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      create: p,
      update: {
        slug: p.slug,
        name: p.name,
        category: p.category,
        cardLabel: p.cardLabel,
        shortDesc: p.shortDesc,
        description: p.description,
        specs: p.specs,
        unitsPerPack: p.unitsPerPack,
        priceCents: p.priceCents,
        sortOrder: p.sortOrder,
        imageAlt: p.imageAlt,
        isActive: true,
      },
    })
  }

  // Anything left over from an earlier catalogue is DEACTIVATED, never
  // deleted: order items reference products, and a past order must still be
  // able to say what was bought.
  const live = PRODUCTS.map((p) => p.sku)
  const retired = await prisma.product.updateMany({
    where: { sku: { notIn: live }, isActive: true },
    data: { isActive: false },
  })

  for (const key of SETTING_KEYS) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: SETTING_DEFAULTS[key] as never },
      update: {},
    })
  }

  // Settings keys that no longer exist (the courier-era ones) are dropped, so
  // the table does not accumulate rows nothing reads.
  const pruned = await prisma.setting.deleteMany({ where: { key: { notIn: SETTING_KEYS } } })
  if (pruned.count > 0) console.log(`Pruned ${pruned.count} obsolete setting(s).`)

  const products = await prisma.product.count({ where: { isActive: true } })
  const settings = await prisma.setting.count()
  console.log(
    `Seeded: ${products} active products (${retired.count} retired), ${settings} settings.`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
