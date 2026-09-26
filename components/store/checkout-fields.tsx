'use client'

import { Field, Input, Textarea } from '@/components/ui/field'

export type FieldErrors = Partial<Record<string, string>>

/**
 * The §6.1 field set: email, mobile, address line 1, unit number, postal
 * code and particulars — plus an optional name, because a driver at a lobby
 * desk needs someone to ask for.
 *
 * There is NO self-collection field and no pickup option. It is not hidden —
 * it does not exist, here or in the schema behind it.
 */
export function CheckoutFields({ errors }: { errors: FieldErrors }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field id="email" label="Email" required error={errors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          aria-invalid={!!errors.email}
        />
      </Field>

      <Field id="phone" label="Mobile number" required error={errors.phone}>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="9123 4567"
          required
          aria-invalid={!!errors.phone}
        />
      </Field>

      <Field
        id="name"
        label="Name for the delivery"
        error={errors.name}
        hint="Optional — who should the driver ask for?"
        className="sm:col-span-2"
      >
        <Input id="name" name="name" autoComplete="name" aria-invalid={!!errors.name} />
      </Field>

      <Field
        id="addressLine1"
        label="Address line 1"
        required
        error={errors.addressLine1}
        className="sm:col-span-2"
      >
        <Input
          id="addressLine1"
          name="addressLine1"
          autoComplete="address-line1"
          required
          aria-invalid={!!errors.addressLine1}
        />
      </Field>

      <Field id="addressLine2" label="Apartment / unit no." error={errors.addressLine2}>
        <Input
          id="addressLine2"
          name="addressLine2"
          autoComplete="address-line2"
          placeholder="#04-05"
        />
      </Field>

      <Field id="postalCode" label="Postal code" required error={errors.postalCode}>
        <Input
          id="postalCode"
          name="postalCode"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          placeholder="123456"
          required
          aria-invalid={!!errors.postalCode}
        />
      </Field>

      <Field
        id="instructions"
        label="Particulars"
        hint="Gate codes, lift lobby, who to call — anything the driver should know."
        error={errors.instructions}
        className="sm:col-span-2"
      >
        <Textarea id="instructions" name="instructions" maxLength={280} rows={3} />
      </Field>
    </div>
  )
}
