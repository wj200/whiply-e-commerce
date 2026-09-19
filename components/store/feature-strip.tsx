/** Four claims on hairlines. Every one is true of what is actually built. */
const ITEMS = [
  { icon: BoxIcon, label: 'Made for culinary creativity' },
  { icon: TruckIcon, label: 'Singapore-wide delivery' },
  { icon: ClockIcon, label: 'On-demand courier dispatch' },
  { icon: PinIcon, label: 'Local. Right where you need us.' },
]

export function FeatureStrip() {
  return (
    <section className="wrap">
      <div className="grid grid-cols-1 gap-y-6 border-y border-line py-7 sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-3.5">
            <Icon />
            <p className="text-[0.9375rem] text-body">{label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

const stroke = { stroke: 'currentColor', strokeWidth: 1.2, fill: 'none' } as const

function BoxIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="shrink-0 text-ink" aria-hidden="true">
      <path d="M12 3l8 4.2v9.6L12 21l-8-4.2V7.2L12 3z" {...stroke} />
      <path d="M9.4 14.3l1.8 1.8 3.6-4" {...stroke} strokeLinecap="round" />
    </svg>
  )
}

function TruckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="shrink-0 text-ink" aria-hidden="true">
      <path d="M2.5 6.5h11v9h-11z" {...stroke} />
      <path d="M13.5 9.5h4l3 3v3h-7z" {...stroke} />
      <circle cx="7" cy="17.5" r="1.7" {...stroke} />
      <circle cx="17" cy="17.5" r="1.7" {...stroke} />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="shrink-0 text-ink" aria-hidden="true">
      <circle cx="12" cy="12" r="8.6" {...stroke} />
      <path d="M12 7.4V12l3 1.8" {...stroke} strokeLinecap="round" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="shrink-0 text-ink" aria-hidden="true">
      <path d="M12 21s6.2-5.6 6.2-10A6.2 6.2 0 0 0 5.8 11c0 4.4 6.2 10 6.2 10z" {...stroke} />
      <circle cx="12" cy="10.8" r="2.3" {...stroke} />
    </svg>
  )
}
