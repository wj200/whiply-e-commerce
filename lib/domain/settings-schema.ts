import { z } from 'zod'

/**
 * Blueprint §9.7 — every operator-tunable value in the system.
 *
 * These are ROWS, not environment variables and not constants: the launch
 * requirement is that an operator can change all of them without a deploy.
 * Each key is typed and validated on write, so a negative fee or a malformed
 * pickup address cannot be stored.
 */

export const pickupAddressSchema = z.object({
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional().default(''),
  postalCode: z.string().regex(/^\d{6}$/, 'Singapore postal code must be 6 digits'),
  contactName: z.string().min(1).max(100),
  contactPhone: z.string().min(1).max(30),
})

export type PickupAddress = z.infer<typeof pickupAddressSchema>

export const settingsSchema = {
  delivery_fee_cents: z.number().int().min(0).max(100_000),
  free_delivery_threshold_cents: z.number().int().min(0).max(10_000_000),
  auto_dispatch_enabled: z.boolean(),
  pickup_address: pickupAddressSchema.nullable(),
  lalamove_vehicle_type: z.string().min(1).max(40),
  order_expiry_minutes: z.number().int().min(5).max(10_080),
  low_stock_threshold_default: z.number().int().min(0).max(10_000),
  store_open: z.boolean(),
} as const

export type SettingKey = keyof typeof settingsSchema
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingsSchema)[K]>

export type SettingsMap = { [K in SettingKey]: SettingValue<K> }

/**
 * Defaults. `auto_dispatch_enabled` is false — GUARD-3. It is not a
 * placeholder: the system ships with automatic courier dispatch OFF and it
 * stays off until a carrier has confirmed in writing what it will carry.
 */
export const SETTING_DEFAULTS: SettingsMap = {
  delivery_fee_cents: 2000,
  free_delivery_threshold_cents: 20000,
  auto_dispatch_enabled: false,
  pickup_address: null,
  lalamove_vehicle_type: 'MOTORCYCLE',
  order_expiry_minutes: 120,
  low_stock_threshold_default: 10,
  store_open: true,
}

export const SETTING_KEYS = Object.keys(settingsSchema) as SettingKey[]

export function parseSetting<K extends SettingKey>(key: K, raw: unknown): SettingValue<K> {
  return settingsSchema[key].parse(raw) as SettingValue<K>
}
