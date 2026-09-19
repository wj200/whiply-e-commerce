import { PrismaClient, ProductCategory } from '../lib/generated/prisma'
import { SETTING_DEFAULTS, SETTING_KEYS } from '../lib/domain/settings-schema'

const prisma = new PrismaClient()

/**
 * Blueprint §4.1 — the launch catalogue.
 *
 * NOTE ON THE 3.3 L PRICE (§4.2): the source specification gives S$90 in the
 * catalogue and on the homepage, and S$85 in the shop grid. S$90 is treated as
 * authoritative here. Once seeded this is an admin-panel field, not a code
 * change — see §4.5.
 */
const PRODUCTS = [
  {
    sku: 'WHP-N2O-640',
    slug: 'food-grade-n2o-cream-charger-1l-640g',
    name: 'Food-Grade N₂O Cream Charger — 1L / 640g',
    category: ProductCategory.CREAM_CHARGERS,
    shortDesc: 'Food-grade nitrous oxide for professional cream whipping. 1L / 640g.',
    description:
      'A food-grade nitrous oxide (N₂O) cream charger sized for professional kitchen use. ' +
      'Intended for culinary cream whipping and related preparations with a compatible ' +
      'whipped-cream dispenser. Store and handle according to the applicable product ' +
      'safety information supplied with the cylinder.',
    specs: [
      { label: 'Capacity', value: '1 L' },
      { label: 'Net weight', value: '640 g' },
      { label: 'Gas', value: 'Food-grade N₂O (nitrous oxide)' },
      { label: 'Intended use', value: 'Culinary cream whipping and baking preparation' },
      {
        label: 'Safety information',
        value:
          'Pressurised container. Keep away from heat and direct sunlight. ' +
          'Use only with equipment rated for this cylinder. Follow the handling and ' +
          'storage instructions supplied with the product.',
      },
    ],
    priceCents: 3500,
    stockQty: 120,
    lowStockAt: 20,
    sortOrder: 10,
    imageAlt: 'Freshly whipped cream being piped in a professional kitchen',
  },
  {
    sku: 'WHP-N2O-2000',
    slug: 'food-grade-n2o-cream-charger-3-3l-2000g',
    name: 'Food-Grade N₂O Cream Charger — 3.3L / 2,000g',
    category: ProductCategory.CREAM_CHARGERS,
    shortDesc: 'Food-grade nitrous oxide for high-volume service. 3.3L / 2,000g.',
    description:
      'A larger food-grade nitrous oxide (N₂O) cream charger for kitchens working at ' +
      'volume. Intended for culinary cream whipping and related preparations with a ' +
      'compatible whipped-cream dispenser. Store and handle according to the applicable ' +
      'product safety information supplied with the cylinder.',
    specs: [
      { label: 'Capacity', value: '3.3 L' },
      { label: 'Net weight', value: '2,000 g' },
      { label: 'Gas', value: 'Food-grade N₂O (nitrous oxide)' },
      { label: 'Intended use', value: 'Culinary cream whipping and baking preparation' },
      {
        label: 'Safety information',
        value:
          'Pressurised container. Keep away from heat and direct sunlight. ' +
          'Use only with equipment rated for this cylinder. Follow the handling and ' +
          'storage instructions supplied with the product.',
      },
    ],
    priceCents: 9000,
    stockQty: 60,
    lowStockAt: 10,
    sortOrder: 20,
    imageAlt: 'Professional whipped-cream dispenser being used in a pastry kitchen',
  },
  {
    sku: 'WHP-EQ-SCALE',
    slug: 'precision-digital-weighing-scale',
    name: 'Precision Digital Weighing Scale',
    category: ProductCategory.BAKING_EQUIPMENT,
    shortDesc: 'Accurate, repeatable measurement for professional baking.',
    description:
      'A precision digital weighing scale for bakery and pastry work, where consistency ' +
      'depends on accurate measurement. Specifications below are maintained by WHIPLY ' +
      'and reflect the supplier documentation for the current stock.',
    specs: [
      { label: 'Type', value: 'Digital precision bench scale' },
      { label: 'Use', value: 'Bakery and pastry measurement' },
    ],
    priceCents: 20000,
    stockQty: 15,
    lowStockAt: 3,
    sortOrder: 30,
    imageAlt: 'Digital precision weighing scale on a clean kitchen work surface',
  },
  {
    sku: 'WHP-EQ-MIXER',
    slug: 'industrial-grade-professional-mixer',
    name: 'Industrial-Grade Professional Mixer',
    category: ProductCategory.BAKING_EQUIPMENT,
    shortDesc: 'Built for continuous professional use.',
    description:
      'An industrial-grade stand mixer intended for continuous professional kitchen use. ' +
      'Specifications below are maintained by WHIPLY and reflect the supplier ' +
      'documentation for the current stock.',
    specs: [
      { label: 'Type', value: 'Professional stand mixer' },
      { label: 'Use', value: 'Continuous commercial bakery use' },
    ],
    priceCents: 55000,
    stockQty: 8,
    lowStockAt: 2,
    sortOrder: 40,
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
        shortDesc: p.shortDesc,
        description: p.description,
        specs: p.specs,
        sortOrder: p.sortOrder,
        imageAlt: p.imageAlt,
      },
    })
  }

  for (const key of SETTING_KEYS) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: SETTING_DEFAULTS[key] as never },
      update: {},
    })
  }

  const products = await prisma.product.count()
  const settings = await prisma.setting.count()
  console.log(`Seeded: ${products} products, ${settings} settings.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
