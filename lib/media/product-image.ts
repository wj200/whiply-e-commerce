/**
 * Blueprint §4.4 — image resolution.
 *
 * A product's `imageUrl` is whatever the operator uploaded (an R2 URL). Until
 * they upload one, a consistent branded placeholder stands in, chosen by SKU so
 * the four products still read as one catalogue. The operator replaces these
 * from Admin → Products with no code change (§4.5), and the licensing paper
 * trail for real photography is checklist item §16.14.
 */
const PLACEHOLDER_BY_SKU: Record<string, string> = {
  'WHP-N2O-640': '/images/charger-1l.svg',
  'WHP-N2O-2000': '/images/charger-3l.svg',
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
