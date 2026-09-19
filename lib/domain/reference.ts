import { randomInt } from 'node:crypto'

/**
 * Blueprint §6.2 — order references.
 *
 * WHP-YYYYMMDD-XXXXX. Short enough to read over the phone, unique by
 * construction, and NOT enumerable — which matters because the success page
 * looks an order up by reference (§6.6).
 *
 * Crockford base-32 alphabet: no I, L, O or U, so nothing is misread as a
 * digit and nothing accidentally spells a word.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const SUFFIX_LENGTH = 5

export const REFERENCE_PATTERN = /^WHP-\d{8}-[0-9A-HJKMNP-TV-Z]{5}$/

export function generateReference(now: Date = new Date()): string {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')

  let suffix = ''
  for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
    suffix += ALPHABET[randomInt(ALPHABET.length)]
  }

  return `WHP-${y}${m}${d}-${suffix}`
}

export function isValidReference(value: string): boolean {
  return REFERENCE_PATTERN.test(value)
}
