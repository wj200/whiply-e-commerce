import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

/**
 * Blueprint §9.1 / §12.1 — admin password hashing.
 *
 * Node's built-in scrypt: memory-hard, in the standard library, no native
 * module to fail a build. Parameters are stored IN the hash string so they
 * can be raised later without invalidating existing hashes.
 *
 * Format: scrypt$N$r$p$saltB64$hashB64
 */
const N = 16384
const r = 8
const p = 1
const KEYLEN = 64

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, KEYLEN)
  return ['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const saltB64 = parts[4]
  const hashB64 = parts[5]
  if (!saltB64 || !hashB64) return false

  try {
    const salt = Buffer.from(saltB64, 'base64')
    const expected = Buffer.from(hashB64, 'base64')
    const actual = await scrypt(password, salt, expected.length)
    if (actual.length !== expected.length) return false
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
