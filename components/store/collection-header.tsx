import { CategoryChips } from './category-chips'
import { UsageNote } from './usage-note'

export function CollectionHeader({
  eyebrow,
  title,
  blurb,
  count,
  active,
  showUsageNote,
}: {
  eyebrow: string
  title: string
  blurb: string
  count: number
  active: 'all' | 'equipment' | 'chargers' | 'cream'
  showUsageNote?: boolean
}) {
  return (
    <div className="wrap pt-12 lg:pt-16">
      <p className="mono text-ink">{eyebrow}</p>

      <div className="mt-6 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <h1 className="display-sm max-w-3xl text-[clamp(1.9rem,4.2vw,3.1rem)]">{title}</h1>
        <p className="shrink-0 max-w-sm text-[0.9375rem] leading-relaxed text-muted lg:text-right">
          {blurb}
        </p>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-5">
        <CategoryChips active={active} />
        <p className="mono text-faint">
          {String(count).padStart(2, '0')} {count === 1 ? 'Essential' : 'Essentials'}
        </p>
      </div>

      {showUsageNote ? (
        <div className="mt-8">
          <UsageNote />
        </div>
      ) : null}
    </div>
  )
}
