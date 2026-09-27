import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {
  productImageSrc,
  isPlaceholderImage,
  BUNDLED_IMAGE_PATHS,
} from '@/lib/media/product-image'

describe('product images', () => {
  it('EVERY bundled path the catalogue can resolve to actually exists', () => {
    // A mapping that points at a file nobody added renders a broken frame on
    // the storefront and nowhere else — so it fails here instead.
    const missing = BUNDLED_IMAGE_PATHS.filter(
      (p) => !existsSync(path.join(process.cwd(), 'public', p.replace(/^\//, ''))),
    )
    expect(missing).toEqual([])
  })

  it("prefers the operator's uploaded image over anything bundled", () => {
    expect(
      productImageSrc({ sku: 'WHP-EQ-MIXER', imageUrl: 'https://cdn.example/mixer.jpg' }),
    ).toBe('https://cdn.example/mixer.jpg')
  })

  it('gives the two cylinder sizes different images', () => {
    const small = productImageSrc({ sku: 'WHP-N2O-640-1', imageUrl: null })
    const large = productImageSrc({ sku: 'WHP-N2O-2500-1', imageUrl: null })
    expect(small).not.toBe(large)
  })

  it('gives pack sizes of ONE cylinder the same image', () => {
    const one = productImageSrc({ sku: 'WHP-N2O-640-1', imageUrl: null })
    const twelve = productImageSrc({ sku: 'WHP-N2O-640-12', imageUrl: null })
    expect(one).toBe(twelve)
  })

  it('resolves an image for EVERY SKU in the catalogue', () => {
    const skus = [
      'WHP-N2O-640-1', 'WHP-N2O-640-6', 'WHP-N2O-640-12',
      'WHP-N2O-2500-1', 'WHP-N2O-2500-2', 'WHP-N2O-2500-4',
      'WHP-CR-POWDER-250', 'WHP-CR-SPRAY', 'WHP-CR-FRESH-250', 'WHP-CR-NESTLE-250',
      'WHP-EQ-DISPENSER', 'WHP-EQ-SCALE', 'WHP-EQ-MIXER',
    ]
    for (const sku of skus) {
      expect(productImageSrc({ sku, imageUrl: null })).toMatch(/^\/images\/.+\.(svg|webp|png|jpg)$/)
    }
  })

  it('falls back rather than rendering nothing for an unknown SKU', () => {
    expect(productImageSrc({ sku: 'NOT-A-SKU', imageUrl: null })).toBe('/images/cream.svg')
  })

  it('knows which products are still showing placeholder art', () => {
    // Nothing has real photography wired up yet — the four supplied files are
    // not in the repo. Once they are, the scale flips to false here.
    expect(isPlaceholderImage({ sku: 'WHP-CR-SPRAY', imageUrl: null })).toBe(true)
    expect(isPlaceholderImage({ sku: 'WHP-CR-SPRAY', imageUrl: 'https://x/y.jpg' })).toBe(false)
  })
})
