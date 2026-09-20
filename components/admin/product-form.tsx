'use client'

import { useState, useTransition } from 'react'
import { updateProductAction } from '@/lib/admin/actions'
import { Field, Input, Textarea } from '@/components/ui/field'

export function ProductForm({
  product,
}: {
  product: {
    id: string
    name: string
    cardLabel: string | null
    shortDesc: string
    description: string
    priceCents: number
    stockQty: number
    lowStockAt: number
    isActive: boolean
  }
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [stock, setStock] = useState(product.stockQty)

  const stockChanged = stock !== product.stockQty

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        setError(null)
        setSaved(false)
        start(async () => {
          const result = await updateProductAction(formData)
          if (result.ok) setSaved(true)
          else setError(result.error ?? 'Could not save.')
        })
      }}
    >
      <input type="hidden" name="id" value={product.id} />

      <Field id="name" label="Name" required>
        <Input id="name" name="name" defaultValue={product.name} required />
      </Field>

      <Field
        id="cardLabel"
        label="Card label"
        hint="The small uppercase label on the product card image."
      >
        <Input id="cardLabel" name="cardLabel" defaultValue={product.cardLabel ?? ''} />
      </Field>

      <Field id="shortDesc" label="Subtitle" required hint="One line under the name on the card.">
        <Input id="shortDesc" name="shortDesc" defaultValue={product.shortDesc} required />
      </Field>

      <Field id="description" label="Description" required>
        <Textarea id="description" name="description" rows={6} defaultValue={product.description} required />
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field id="priceSgd" label="Price (SGD)" required>
          <Input
            id="priceSgd"
            name="priceSgd"
            inputMode="decimal"
            defaultValue={(product.priceCents / 100).toFixed(2)}
            required
            className="figure"
          />
        </Field>

        <Field id="stockQty" label="Stock" required>
          <Input
            id="stockQty"
            name="stockQty"
            inputMode="numeric"
            value={stock}
            onChange={(e) => setStock(Number(e.target.value))}
            required
            className="figure"
          />
        </Field>

        <Field id="lowStockAt" label="Low-stock at" required>
          <Input
            id="lowStockAt"
            name="lowStockAt"
            inputMode="numeric"
            defaultValue={product.lowStockAt}
            required
            className="figure"
          />
        </Field>
      </div>

      {stockChanged ? (
        <Field
          id="stockReason"
          label="Reason for the stock change"
          required
          hint="Restock, correction, damage… This is written to the audit log."
        >
          <Input id="stockReason" name="stockReason" required />
        </Field>
      ) : null}

      <label className="flex items-center gap-2.5 text-[0.9375rem] text-body">
        <input type="checkbox" name="isActive" defaultChecked={product.isActive} />
        Live on the storefront
      </label>

      {error ? (
        <p role="alert" className="mono-sm border border-[#9c3b2b]/35 px-3 py-2.5 text-[#9c3b2b]">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="h-12 bg-ink px-8 text-[0.9375rem] font-medium text-paper transition-colors hover:bg-body disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        {saved ? <p className="mono-sm text-[#1f5d4c]">Saved — live on the storefront now.</p> : null}
      </div>
    </form>
  )
}
