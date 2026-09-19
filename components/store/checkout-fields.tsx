'use client'

import { Field, Input, Textarea } from '@/components/ui/field'

export type FieldErrors = Partial<Record<string, string>>

/**
 * The §6.1 field set, shared by the bag drawer and the /checkout page so
 * there is one definition of what checkout asks for.
 *
 * There is NO self-collection field, no delivery-method selector and no
 * pickup option. It is not hidden — it does not exist.
 */
export function CheckoutFields({ errors }: { errors: FieldErrors }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field id="name" label="Full name" required error={errors.name} className="sm:col-span-2">
        <Input id="name" name="name" autoComplete="name" required aria-invalid={!!errors.name} />
      </Field>

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
        id="addressLine1"
        label="Delivery address"
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

      <Field id="addressLine2" label="Unit / floor" error={errors.addressLine2}>
        <Input id="addressLine2" name="addressLine2" autoComplete="address-line2" placeholder="#04-05" />
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
        label="Delivery instructions"
        error={errors.instructions}
        className="sm:col-span-2"
      >
        <Textarea id="instructions" name="instructions" maxLength={280} rows={3} />
      </Field>
    </div>
  )
}
