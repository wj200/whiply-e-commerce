'use client'

import { useState, useTransition } from 'react'
import { updateSettingsAction } from '@/lib/admin/actions'
import { Field, Input } from '@/components/ui/field'
import type { SettingsMap } from '@/lib/domain/settings-schema'

export function SettingsForm({ settings }: { settings: SettingsMap }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [autoDispatch, setAutoDispatch] = useState(settings.auto_dispatch_enabled)

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
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="deliveryFeeSgd" label="Delivery fee (SGD)" required>
            <Input
              id="deliveryFeeSgd"
              name="deliveryFeeSgd"
              inputMode="decimal"
              defaultValue={(settings.delivery_fee_cents / 100).toFixed(2)}
              required
              className="figure"
            />
          </Field>
          <Field id="freeDeliveryThresholdSgd" label="Free delivery above (SGD)" required>
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
          The threshold is assessed on the order value <strong>after</strong> any discount.
        </p>
      </section>

      <section className="border-t border-line pt-7">
        <h2 className="mono mb-4 text-faint">Courier dispatch</h2>

        <label className="flex cursor-pointer items-start gap-3 border border-line-strong px-4 py-4">
          <input
            type="checkbox"
            name="autoDispatch"
            checked={autoDispatch}
            onChange={(e) => setAutoDispatch(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="text-[0.9375rem] font-medium text-ink">
              Automatic delivery dispatch
            </span>
            <span className="mt-1 block text-[0.8125rem] leading-relaxed text-muted">
              When on, a paid order books a courier automatically. When off, paid orders wait in
              Ready for delivery until you book them by hand.
            </span>
          </span>
        </label>

        {autoDispatch ? (
          <div className="mt-3 border border-[#9c3b2b]/40 bg-[#9c3b2b]/5 px-4 py-3">
            <p className="mono text-[#9c3b2b]">Before you turn this on</p>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-body">
              Some WHIPLY products are pressurised N₂O cylinders. Confirm <strong>in writing</strong>{' '}
              with the carrier what they will transport, under what packaging and on which vehicle
              types, before enabling automatic dispatch.
            </p>
          </div>
        ) : (
          <p className="mono-sm mt-3 text-[#1f5d4c]">
            Off — no courier is booked without a human. This is the shipped default.
          </p>
        )}

        <div className="mt-5">
          <Field id="vehicleType" label="Vehicle / service type" required>
            <Input
              id="vehicleType"
              name="vehicleType"
              defaultValue={settings.lalamove_vehicle_type}
              required
              className="figure"
            />
          </Field>
        </div>
      </section>

      <section className="border-t border-line pt-7">
        <h2 className="mono mb-4 text-faint">Warehouse pickup address</h2>
        <p className="mb-4 text-[0.8125rem] text-muted">
          Every courier booking starts here. A booking with no address fails with a message rather
          than sending a driver nowhere.
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
