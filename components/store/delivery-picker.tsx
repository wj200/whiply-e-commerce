'use client'

import * as React from 'react'
import { formatSgd, cents } from '@/lib/money'

export type SlotDay = {
  dateKey: string
  slots: { start: string; end: string; label: string }[]
}

export type SlotsResponse = {
  method: 'STANDARD' | 'EXPRESS'
  orderingOpen: boolean
  closedMessage: string | null
  leadMinutes: number
  days: SlotDay[]
}

/**
 * Blueprint §7.2 — choosing a speed and a slot.
 *
 * The list is fetched from the server on every method change rather than
 * generated here. Two reasons, and both matter: the operator can move the
 * hours without a deploy, and a browser with a wrong clock cannot offer a
 * slot the server would then refuse.
 *
 * Express legitimately runs out of slots before standard does each evening —
 * the last slot of the day still needs its hour of notice. That is a real
 * state with its own message, not an error.
 */
export function DeliveryPicker({
  method,
  onMethodChange,
  slotStart,
  onSlotChange,
  standardFeeCents,
  expressFeeCents,
  freeDeliveryApplied,
  error,
}: {
  method: 'STANDARD' | 'EXPRESS'
  onMethodChange: (method: 'STANDARD' | 'EXPRESS') => void
  slotStart: string | null
  onSlotChange: (start: string | null) => void
  standardFeeCents: number
  expressFeeCents: number
  freeDeliveryApplied: boolean
  error?: string | null
}) {
  const [data, setData] = React.useState<SlotsResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const requestId = React.useRef(0)

  React.useEffect(() => {
    const id = ++requestId.current
    setLoading(true)
    fetch(`/api/delivery/slots?method=${method}`)
      .then((res) => res.json() as Promise<SlotsResponse>)
      .then((body) => {
        if (id !== requestId.current) return
        setData(body)
        // A slot chosen for the other speed is almost never valid for this
        // one, so the choice is cleared rather than silently carried over.
        const stillThere = body.days.some((d) => d.slots.some((s) => s.start === slotStart))
        if (!stillThere) onSlotChange(null)
      })
      .catch(() => {
        if (id === requestId.current) setData(null)
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false)
      })
    // `slotStart`/`onSlotChange` deliberately excluded: this effect refetches
    // when the METHOD changes, not when the customer picks a slot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method])

  const fee = (value: number) => (freeDeliveryApplied ? 'FREE' : formatSgd(cents(value)))

  return (
    <div>
      <p className="mono mb-4 text-faint">Delivery speed</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <SpeedOption
          selected={method === 'STANDARD'}
          onSelect={() => onMethodChange('STANDARD')}
          name="Standard"
          detail="2–3 working days"
          price={fee(standardFeeCents)}
        />
        <SpeedOption
          selected={method === 'EXPRESS'}
          onSelect={() => onMethodChange('EXPRESS')}
          name="Express"
          detail="Within 2 hours"
          price={fee(expressFeeCents)}
        />
      </div>

      <p className="mono mb-4 mt-8 text-faint">
        Delivery slot
        {data ? <span className="text-muted"> / {data.leadMinutes} min notice</span> : null}
      </p>

      {loading ? (
        <p className="mono-sm text-faint">Finding slots…</p>
      ) : !data ? (
        <p className="mono-sm text-[#9c3b2b]">We could not load delivery slots. Please refresh.</p>
      ) : !data.orderingOpen ? (
        <p className="border border-line-strong px-4 py-3.5 text-[0.875rem] text-body">
          {data.closedMessage}
        </p>
      ) : data.days.length === 0 ? (
        <p className="border border-line-strong px-4 py-3.5 text-[0.875rem] text-body">
          {method === 'EXPRESS'
            ? 'No express slots left today — every remaining slot is inside the notice period. Choose standard delivery instead.'
            : 'No delivery slots are available right now. Please try again shortly.'}
        </p>
      ) : (
        <div className="space-y-5">
          {data.days.map((day) => (
            <div key={day.dateKey}>
              <p className="mono-sm mb-2.5 text-muted">{dayHeading(day.dateKey)}</p>
              <div className="flex flex-wrap gap-2">
                {day.slots.map((slot) => {
                  const selected = slot.start === slotStart
                  return (
                    <button
                      key={slot.start}
                      type="button"
                      onClick={() => onSlotChange(slot.start)}
                      aria-pressed={selected}
                      className={`figure h-10 border px-3.5 text-[0.8125rem] transition-colors ${
                        selected
                          ? 'border-ink bg-ink text-paper'
                          : 'border-line-strong text-body hover:border-ink'
                      }`}
                    >
                      {slot.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {error ? (
        <p role="alert" className="mono-sm mt-3 text-[#9c3b2b]">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function SpeedOption({
  selected,
  onSelect,
  name,
  detail,
  price,
}: {
  selected: boolean
  onSelect: () => void
  name: string
  detail: string
  price: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex items-start justify-between gap-4 border px-4 py-4 text-left transition-colors ${
        selected ? 'border-ink bg-veil' : 'border-line-strong hover:border-ink'
      }`}
    >
      <span>
        <span className="block text-[0.9375rem] font-medium text-ink">{name}</span>
        <span className="mt-1 block text-[0.8125rem] text-muted">{detail}</span>
      </span>
      <span className="figure shrink-0 text-[0.9375rem] text-ink">{price}</span>
    </button>
  )
}

/** "Today", "Tomorrow", or "Thu 1 Oct" — in Singapore time. */
function dayHeading(dateKey: string): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date())
  if (dateKey === today) return 'Today'

  const [y, m, d] = dateKey.split('-').map(Number)
  if (!y || !m || !d) return dateKey

  const asDate = new Date(Date.UTC(y, m - 1, d))
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(
    new Date(Date.now() + 24 * 60 * 60_000),
  )
  if (dateKey === tomorrow) return 'Tomorrow'

  return new Intl.DateTimeFormat('en-SG', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(asDate)
}
