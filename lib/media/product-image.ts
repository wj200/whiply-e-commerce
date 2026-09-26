/**
 * Blueprint §4.4 — image resolution.
 *
 * A product's `imageUrl` is whatever the operator uploaded (an R2 URL). Until
 * they upload one, a consistent branded placeholder stands in, chosen by SKU
 * so the catalogue still reads as one set. Pack sizes of the same cylinder
 * deliberately share a placeholder — a photo will distinguish them; a drawing
 * would only pretend to. The operator replaces these
 * from Admin → Products with no code change (§4.5), and the licensing paper
 * trail for real photography is checklist item §16.14.
 */
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

const GENERIC_PLACEHOLDER = '/images/charger-1l.svg'

export function productImageSrc(product: { sku: string; imageUrl: string | null }): string {
  return product.imageUrl ?? PLACEHOLDER_BY_SKU[product.sku] ?? GENERIC_PLACEHOLDER
}

/** True when we are showing our own placeholder rather than a real photograph. */
export function isPlaceholderImage(product: { imageUrl: string | null }): boolean {
  return product.imageUrl === null
}
