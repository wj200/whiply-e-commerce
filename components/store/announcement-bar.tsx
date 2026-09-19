import Link from 'next/link'
import { formatSgd, cents } from '@/lib/money'
import { ArrowUpRight } from '@/components/ui/arrow'

/**
 * The black strip above the header. The delivery figure is rendered FROM
 * SETTINGS — changing the threshold in the admin panel changes this bar,
 * with no deploy (§4.5, milestone A4).
 */
export function AnnouncementBar({
  freeDeliveryThresholdCents,
}: {
  freeDeliveryThresholdCents: number
}) {
  return (
    <div className="bg-ink text-paper">
      <div className="wrap flex h-10 items-center justify-between gap-4">
        <p className="mono-sm truncate text-paper/85">
          Singapore, meet your kitchen&apos;s next chapter.
        </p>
        <Link
          href="/policies/delivery"
          className="group hidden shrink-0 items-center gap-1.5 text-[0.8125rem] text-paper/85 transition-colors hover:text-paper sm:flex"
        >
          Free delivery on orders above {formatSgd(cents(freeDeliveryThresholdCents))}
          <ArrowUpRight size={12} className="transition-transform group-hover:-translate-y-px" />
        </Link>
      </div>
    </div>
  )
}
