import 'server-only'
import { prisma } from '@/lib/db/client'
import {
  SETTING_DEFAULTS,
  SETTING_KEYS,
  parseSetting,
  type SettingKey,
  type SettingValue,
  type SettingsMap,
  slotRulesFrom,
} from './settings-schema'
import type { PricingSettings } from './pricing'
import type { SlotRules } from './delivery-slots'

/**
 * Cached accessor over the settings table (§2.4).
 *
 * A short in-process cache keeps a page render from doing a round trip per
 * setting; `invalidateSettings()` is called on every write so an operator's
 * change takes effect on the next request with no deploy.
 */

const CACHE_TTL_MS = 5_000

let cache: { at: number; value: SettingsMap } | null = null

export function invalidateSettings(): void {
  cache = null
}

export async function getAllSettings(): Promise<SettingsMap> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value

  const rows = await prisma.setting.findMany()
  const byKey = new Map(rows.map((r) => [r.key, r.value]))
  const value = { ...SETTING_DEFAULTS }

  for (const key of SETTING_KEYS) {
    if (!byKey.has(key)) continue
    try {
      // @ts-expect-error indexed write across the discriminated map
      value[key] = parseSetting(key, byKey.get(key))
    } catch {
      // A corrupt row must not take the storefront down: fall back to the
      // default and let the admin panel surface the problem.
      console.warn(`[settings] invalid stored value for ${key}; using default`)
    }
  }

  cache = { at: Date.now(), value }
  return value
}

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const all = await getAllSettings()
  return all[key]
}

export async function setSetting<K extends SettingKey>(
  key: K,
  raw: unknown,
  updatedBy?: string,
): Promise<SettingValue<K>> {
  const parsed = parseSetting(key, raw)
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: parsed as never, updatedBy: updatedBy ?? null },
    update: { value: parsed as never, updatedBy: updatedBy ?? null },
  })
  invalidateSettings()
  return parsed
}

/** Pricing only ever needs these three. Kept narrow on purpose. */
export async function getPricingSettings(): Promise<PricingSettings> {
  const all = await getAllSettings()
  return {
    standardDeliveryFeeCents: all.standard_delivery_fee_cents,
    expressDeliveryFeeCents: all.express_delivery_fee_cents,
    freeDeliveryThresholdCents: all.free_delivery_threshold_cents,
  }
}

/** The slot rules an operator has configured (§7.2). */
export async function getSlotRules(): Promise<SlotRules> {
  return slotRulesFrom(await getAllSettings())
}
