import { z } from 'zod'

/**
 * Blueprint §6.1 — what checkout asks for.
 *
 * The field list is fixed by the brief: email, phone, address line 1
 * (compulsory), address line 2 for the unit number, postal code, and
 * particulars. There is deliberately NO self-collection field and no pickup
 * option anywhere in this schema. It is not merely hidden in the UI: no code
 * path can produce an order without a delivery address.
 *
 * Name is OPTIONAL. It is not on the brief's list, but a driver at a lobby
 * desk needs someone to ask for, so it is offered and left blank-able; when
 * blank, `orders.contact_name` falls back to the email's local part rather
 * than storing an empty string that then has to be special-cased everywhere
 * downstream (see `resolveContactName`).
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
  name: z.string().trim().max(100).optional().or(z.literal('')),
  email: z.string().trim().email('Enter a valid email address').max(254),
  phone: phoneField,
  addressLine1: z.string().trim().min(1, 'Address line 1 is required').max(200),
  /** Apartment / unit number. */
  addressLine2: z.string().trim().max(200).optional().or(z.literal('')),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter a 6-digit Singapore postal code'),
  /** "Particulars" on the brief — anything the driver needs to know. */
  instructions: z.string().trim().max(280).optional().or(z.literal('')),
})

export type CheckoutContact = z.infer<typeof checkoutContactSchema>

/** Never returns an empty string, so nothing downstream has to handle one. */
export function resolveContactName(contact: { name?: string; email: string }): string {
  const given = contact.name?.trim()
  if (given) return given
  const local = contact.email.trim().split('@')[0] ?? ''
  return local || 'Customer'
}

export const deliveryMethodSchema = z.enum(['STANDARD', 'EXPRESS'])

/** The delivery half of the checkout payload. Validated against the clock
 *  server-side by `validateSlotChoice` — this only checks the shape. */
export const deliveryChoiceSchema = z.object({
  method: deliveryMethodSchema,
  slotStart: z.string().datetime({ offset: true }),
})

export type DeliveryChoice = z.infer<typeof deliveryChoiceSchema>

export const enquirySchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(100),
  email: z.string().trim().email('Enter a valid email address').max(254),
  phone: phoneField,
  message: z.string().trim().max(1000).optional().or(z.literal('')),
})

export type EnquiryInput = z.infer<typeof enquirySchema>
