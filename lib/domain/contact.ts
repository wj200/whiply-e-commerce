import { z } from 'zod'

/**
 * Blueprint §6.1 — what checkout asks for.
 *
 * There is deliberately NO self-collection field, no delivery-method enum and
 * no pickup option anywhere in this schema. It is not merely hidden in the UI:
 * no code path can produce an order without a delivery address.
 */

/** Singapore mobile: 8 digits starting 8 or 9, optional +65. */
export const SG_MOBILE = /^(?:\+?65[-\s]?)?([89]\d{3})[-\s]?(\d{4})$/

export function normalisePhone(input: string): string | null {
  const match = SG_MOBILE.exec(input.trim().replace(/\s+/g, ' '))
  if (!match) return null
  return `+65${match[1]}${match[2]}`
}

export function normaliseEmail(input: string): string {
  return input.trim().toLowerCase()
}

const phoneField = z
  .string()
  .min(1, 'Mobile number is required')
  .refine((v) => normalisePhone(v) !== null, 'Enter a Singapore mobile number, e.g. 9123 4567')

export const checkoutContactSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(100),
  email: z.string().trim().email('Enter a valid email address').max(254),
  phone: phoneField,
  addressLine1: z.string().trim().min(1, 'Address is required').max(200),
  addressLine2: z.string().trim().max(200).optional().or(z.literal('')),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter a 6-digit Singapore postal code'),
  instructions: z.string().trim().max(280).optional().or(z.literal('')),
})

export type CheckoutContact = z.infer<typeof checkoutContactSchema>

export const enquirySchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(100),
  email: z.string().trim().email('Enter a valid email address').max(254),
  phone: phoneField,
  message: z.string().trim().max(1000).optional().or(z.literal('')),
})

export type EnquiryInput = z.infer<typeof enquirySchema>
