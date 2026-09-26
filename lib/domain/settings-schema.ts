import { z } from 'zod'
import { DEFAULT_SLOT_RULES, type SlotRules } from './delivery-slots'

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
  standard_delivery_fee_cents: z.number().int().min(0).max(100_000),
  express_delivery_fee_cents: z.number().int().min(0).max(100_000),
  free_delivery_threshold_cents: z.number().int().min(0).max(10_000_000),
  pickup_address: pickupAddressSchema.nullable(),
  order_expiry_minutes: z.number().int().min(5).max(10_080),
  low_stock_threshold_default: z.number().int().min(0).max(10_000),
  store_open: z.boolean(),

  // Fulfilment clock (§7.2). Operator-tunable because "we are closing early
  // on Friday" must not need a deploy.
  delivery_first_hour: z.number().int().min(0).max(23),
  delivery_last_slot_hour: z.number().int().min(0).max(23),
  delivery_lead_minutes: z.number().int().min(0).max(24 * 60),
  order_cutoff_hour: z.number().int().min(1).max(24),
  express_window_minutes: z.number().int().min(30).max(24 * 60),
} as const

export type SettingKey = keyof typeof settingsSchema
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingsSchema)[K]>

export type SettingsMap = { [K in SettingKey]: SettingValue<K> }

/**
 * Defaults, matching the published price list: S$10 standard (2–3 working
 * days), S$20 express (within two hours), free at S$200. Delivery slots run
 * 10am to 11pm — the last one STARTS at 10pm — with an hour's notice, and the
 * website itself stops taking orders at 10pm.
 */
export const SETTING_DEFAULTS: SettingsMap = {
  standard_delivery_fee_cents: 1000,
  express_delivery_fee_cents: 2000,
  free_delivery_threshold_cents: 20000,
  pickup_address: null,
  order_expiry_minutes: 120,
  low_stock_threshold_default: 10,
  store_open: true,

  delivery_first_hour: 10,
  delivery_last_slot_hour: 22,
  delivery_lead_minutes: 60,
  order_cutoff_hour: 22,
  express_window_minutes: 120,
}

export const SETTING_KEYS = Object.keys(settingsSchema) as SettingKey[]

export function parseSetting<K extends SettingKey>(key: K, raw: unknown): SettingValue<K> {
  return settingsSchema[key].parse(raw) as SettingValue<K>
}

/**
 * The slot rules, assembled from settings. Kept here rather than in
 * delivery-slots.ts so that module stays pure and free of storage concerns.
 */
export function slotRulesFrom(settings: {
  delivery_first_hour: number
  delivery_last_slot_hour: number
  delivery_lead_minutes: number
  order_cutoff_hour: number
  express_window_minutes: number
}): SlotRules {
  return {
    firstHour: settings.delivery_first_hour,
    lastStartHour: settings.delivery_last_slot_hour,
    leadMinutes: settings.delivery_lead_minutes,
    orderCutoffHour: settings.order_cutoff_hour,
    expressWindowMinutes: settings.express_window_minutes,
    standardMinWorkingDays: DEFAULT_SLOT_RULES.standardMinWorkingDays,
    standardMaxWorkingDays: DEFAULT_SLOT_RULES.standardMaxWorkingDays,
  }
}
