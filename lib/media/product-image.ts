/**
 * Blueprint §4.4 — image resolution.
 *
 * A product's `imageUrl` is whatever the operator uploaded, and it always
 * wins. Below that sit two tiers of bundled art: supplied PHOTOGRAPHY, and
 * branded PLACEHOLDER drawings for what has not been shot yet. A SKU with
 * neither still resolves to something, so the catalogue reads as one set
 * rather than a grid of broken frames.
 */

/**
 * Supplied photography, by SKU. Every path here MUST exist in
 * `public/images/` — `tests/unit/media.test.ts` asserts each file is present,
 * so a mapping that points at a file nobody added fails the suite rather than
 * rendering a broken frame on the storefront.
 *
 * ── Waiting on four files ────────────────────────────────────────────
 * The operator has supplied photography for the chargers, the scale and the
 * mixer. Drop these four into `public/images/` and add the entries below;
 * until then every SKU falls through to the placeholder art, which is why
 * this map is empty rather than optimistic:
 *
 *   charger-640g.webp    → WHP-N2O-640-1  · -6  · -12   (whipped cream rosette)
 *   charger-2500g.webp   → WHP-N2O-2500-1 · -2  · -4    (whipped cream on a spoon)
 *   scale.webp           → WHP-EQ-SCALE                 (digital bench scale)
 *   mixer.webp           → WHP-EQ-MIXER                 (planetary stand mixer)
 *
 * Pack sizes of one cylinder deliberately share a photograph: they are the
 * same product in a different quantity.
 */
const PRODUCT_PHOTOGRAPHY: Record<string, string> = {}

/** Branded placeholder art, awaiting photography (§16.14). */
const PLACEHOLDER_BY_SKU: Record<string, string> = {
  'WHP-N2O-640-1': '/images/charger-1l.svg',
  'WHP-N2O-640-6': '/images/charger-1l.svg',
  'WHP-N2O-640-12': '/images/charger-1l.svg',
  'WHP-N2O-2500-1': '/images/charger-3l.svg',
  'WHP-N2O-2500-2': '/images/charger-3l.svg',
  'WHP-N2O-2500-4': '/images/charger-3l.svg',
  'WHP-CR-POWDER-250': '/images/cream.svg',
  'WHP-CR-SPRAY': '/images/cream.svg',
  'WHP-CR-FRESH-250': '/images/cream.svg',
  'WHP-CR-NESTLE-250': '/images/cream.svg',
  'WHP-EQ-DISPENSER': '/images/dispenser.svg',
  'WHP-EQ-SCALE': '/images/scale.svg',
  'WHP-EQ-MIXER': '/images/mixer.svg',
}

const GENERIC_PLACEHOLDER = '/images/cream.svg'

/** Every bundled path the catalogue can resolve to, for the presence test. */
export const BUNDLED_IMAGE_PATHS: string[] = [
  ...new Set([
    ...Object.values(PRODUCT_PHOTOGRAPHY),
    ...Object.values(PLACEHOLDER_BY_SKU),
    GENERIC_PLACEHOLDER,
  ]),
]

export function productImageSrc(product: { sku: string; imageUrl: string | null }): string {
  return (
    product.imageUrl ??
    PRODUCT_PHOTOGRAPHY[product.sku] ??
    PLACEHOLDER_BY_SKU[product.sku] ??
    GENERIC_PLACEHOLDER
  )
}

/** True when we are showing our own placeholder rather than a photograph. */
export function isPlaceholderImage(product: { sku: string; imageUrl: string | null }): boolean {
  if (product.imageUrl) return false
  return PRODUCT_PHOTOGRAPHY[product.sku] === undefined
}
