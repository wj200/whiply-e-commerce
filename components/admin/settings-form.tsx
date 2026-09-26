'use client'

import { useState, useTransition } from 'react'
import { updateSettingsAction } from '@/lib/admin/actions'
import { Field, Input } from '@/components/ui/field'
import type { SettingsMap } from '@/lib/domain/settings-schema'

export function SettingsForm({ settings }: { settings: SettingsMap }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const pickup = settings.pickup_address

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        setError(null)
        setSaved(false)
        start(async () => {
          const result = await updateSettingsAction(formData)
          if (result.ok) setSaved(true)
          else setError(result.error ?? 'Could not save.')
        })
      }}
    >
      <section>
        <h2 className="mono mb-4 text-faint">Delivery pricing</h2>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field id="standardDeliveryFeeSgd" label="Standard fee (SGD)" required>
            <Input
              id="standardDeliveryFeeSgd"
              name="standardDeliveryFeeSgd"
              inputMode="decimal"
              defaultValue={(settings.standard_delivery_fee_cents / 100).toFixed(2)}
              required
              className="figure"
            />
          </Field>
          <Field id="expressDeliveryFeeSgd" label="Express fee (SGD)" required>
            <Input
              id="expressDeliveryFeeSgd"
              name="expressDeliveryFeeSgd"
              inputMode="decimal"
              defaultValue={(settings.express_delivery_fee_cents / 100).toFixed(2)}
              required
              className="figure"
            />
          </Field>
          <Field id="freeDeliveryThresholdSgd" label="Free delivery at (SGD)" required>
            <Input
              id="freeDeliveryThresholdSgd"
              name="freeDeliveryThresholdSgd"
              inputMode="decimal"
              defaultValue={(settings.free_delivery_threshold_cents / 100).toFixed(2)}
              required
              className="figure"
            />
          </Field>
        </div>
        <p className="mt-3 text-[0.8125rem] text-muted">
          The threshold is assessed on the order value <strong>after</strong> any discount, and it
          waives <strong>both</strong> speeds — a qualifying customer gets express at no charge.
        </p>
      </section>

      <section className="border-t border-line pt-7">
        <h2 className="mono mb-4 text-faint">Delivery slots</h2>
        <p className="mb-4 text-[0.8125rem] leading-relaxed text-muted">
          These four numbers decide what the slot picker offers and when the website stops taking
          orders. Times are Singapore time, on the 24-hour clock.
        </p>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="deliveryFirstHour" label="First slot starts at" required>
            <Input
              id="deliveryFirstHour"
              name="deliveryFirstHour"
              inputMode="numeric"
              defaultValue={settings.delivery_first_hour}
              required
              className="figure"
            />
          </Field>
          <Field id="deliveryLastSlotHour" label="Last slot starts at" required>
            <Input
              id="deliveryLastSlotHour"
              name="deliveryLastSlotHour"
              inputMode="numeric"
              defaultValue={settings.delivery_last_slot_hour}
              required
              className="figure"
            />
          </Field>
          <Field id="deliveryLeadMinutes" label="Notice needed (minutes)" required>
            <Input
              id="deliveryLeadMinutes"
              name="deliveryLeadMinutes"
              inputMode="numeric"
              defaultValue={settings.delivery_lead_minutes}
              required
              className="figure"
            />
          </Field>
          <Field id="orderCutoffHour" label="Orders close at" required>
            <Input
              id="orderCutoffHour"
              name="orderCutoffHour"
              inputMode="numeric"
              defaultValue={settings.order_cutoff_hour}
              required
              className="figure"
            />
          </Field>
        </div>
        <div className="mt-5 sm:max-w-xs">
          <Field id="expressWindowMinutes" label="Express promise (minutes)" required>
            <Input
              id="expressWindowMinutes"
              name="expressWindowMinutes"
              inputMode="numeric"
              defaultValue={settings.express_window_minutes}
              required
              className="figure"
            />
          </Field>
        </div>
        <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
          Express only offers slots that start within the promise <em>and</em> past the notice
          period, so it stops being offered before standard does each evening. Public holidays are
          not excluded automatically — close the store for the day instead.
        </p>
      </section>

      <section className="border-t border-line pt-7">
        <h2 className="mono mb-4 text-faint">Dispatch address</h2>
        <p className="mb-4 text-[0.8125rem] text-muted">
          Where every run starts. It appears on the packing slip and on the run sheet, so the
          person driving knows where to load.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="pickupLine1" label="Address line 1" className="sm:col-span-2">
            <Input id="pickupLine1" name="pickupLine1" defaultValue={pickup?.line1 ?? ''} />
          </Field>
          <Field id="pickupLine2" label="Unit / floor">
            <Input id="pickupLine2" name="pickupLine2" defaultValue={pickup?.line2 ?? ''} />
          </Field>
          <Field id="pickupPostal" label="Postal code">
            <Input
              id="pickupPostal"
              name="pickupPostal"
              maxLength={6}
              defaultValue={pickup?.postalCode ?? ''}
              className="figure"
            />
          </Field>
          <Field id="pickupContactName" label="Contact name">
            <Input id="pickupContactName" name="pickupContactName" defaultValue={pickup?.contactName ?? ''} />
          </Field>
          <Field id="pickupContactPhone" label="Contact phone">
            <Input
              id="pickupContactPhone"
              name="pickupContactPhone"
              defaultValue={pickup?.contactPhone ?? ''}
              className="figure"
            />
          </Field>
        </div>
      </section>

      <section className="border-t border-line pt-7">
        <h2 className="mono mb-4 text-faint">Store</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="orderExpiryMinutes" label="Unpaid order expires after (minutes)" required>
            <Input
              id="orderExpiryMinutes"
              name="orderExpiryMinutes"
              inputMode="numeric"
              defaultValue={settings.order_expiry_minutes}
              required
              className="figure"
            />
          </Field>
          <Field id="lowStockDefault" label="Default low-stock threshold" required>
            <Input
              id="lowStockDefault"
              name="lowStockDefault"
              inputMode="numeric"
              defaultValue={settings.low_stock_threshold_default}
              required
              className="figure"
            />
          </Field>
        </div>

        <label className="mt-5 flex cursor-pointer items-start gap-3 border border-line-strong px-4 py-4">
          <input type="checkbox" name="storeOpen" defaultChecked={settings.store_open} className="mt-1" />
          <span>
            <span className="text-[0.9375rem] font-medium text-ink">Store open</span>
            <span className="mt-1 block text-[0.8125rem] leading-relaxed text-muted">
              The kill switch. Turn off and the storefront still browses, but checkout refuses with
              a notice instead of taking payments.
            </span>
          </span>
        </label>
      </section>

      {error ? (
        <p role="alert" className="mono-sm border border-[#9c3b2b]/35 px-3 py-2.5 text-[#9c3b2b]">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-4 border-t border-line pt-6">
        <button
          type="submit"
          disabled={pending}
          className="h-12 bg-ink px-8 text-[0.9375rem] font-medium text-paper transition-colors hover:bg-body disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Save settings'}
        </button>
        {saved ? <p className="mono-sm text-[#1f5d4c]">Saved — live now.</p> : null}
      </div>
    </form>
  )
}
