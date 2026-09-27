import type { Metadata } from 'next'
import { Prose, AwaitingCopy, PageHeader } from '@/components/store/prose'

import { getPricingSettings, getSlotRules } from '@/lib/domain/settings'
import { formatSgd, cents } from '@/lib/money'

export const metadata: Metadata = { title: 'Delivery Policy' }

function hourLabel(hour: number): string {
  const suffix = hour >= 12 ? 'pm' : 'am'
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve}${suffix}`
}

export default async function DeliveryPolicyPage() {
  const [{ standardDeliveryFeeCents, expressDeliveryFeeCents, freeDeliveryThresholdCents }, rules] =
    await Promise.all([getPricingSettings(), getSlotRules()])

  const free = formatSgd(cents(freeDeliveryThresholdCents))

  return (
    <>
      <PageHeader title="Delivery Policy" />
      <Prose>
        <AwaitingCopy what="delivery terms" />

        <h2>Where we deliver</h2>
        <p>Singapore only. All orders are delivered — there is no self-collection option.</p>

        <h2>What delivery costs</h2>
        <ul>
          <li>
            <strong>Standard</strong> — {formatSgd(cents(standardDeliveryFeeCents))}, arriving in
            2–3 working days.
          </li>
          <li>
            <strong>Express</strong> — {formatSgd(cents(expressDeliveryFeeCents))}, arriving within
            two hours in a slot you choose.
          </li>
          <li>
            Orders of <strong>{free}</strong> or more (after any discount): <strong>free</strong>,
            at either speed, express included.
          </li>
        </ul>
        <p>
          The threshold is assessed on the order value after any discount code has been applied. A{' '}
          {free} order reduced below the threshold by a discount pays the delivery fee.
        </p>

        <h2>Booking a slot</h2>
        <ul>
          <li>
            Slots run from {hourLabel(rules.firstHour)} to{' '}
            {hourLabel(rules.lastStartHour + 1)}, one hour each.
          </li>
          <li>
            A slot must be booked at least {rules.leadMinutes} minutes before it starts, so we have
            time to pack and set off.
          </li>
          <li>
            The last order of the day is accepted at {hourLabel(rules.orderCutoffHour)}. The site
            reopens at {hourLabel(rules.firstHour)}.
          </li>
          <li>
            Express slots are same-day and must begin within{' '}
            {rules.expressWindowMinutes / 60} hours, so express stops being offered roughly an hour
            before the final slot of the day.
          </li>
        </ul>
        <p>
          Public holidays are not automatically excluded from standard delivery dates. If we are
          closed on a day you have booked, we will contact you to rearrange.
        </p>

        <h2>If something goes wrong</h2>
        <p>
          If nobody is at the address during your slot, we will call the mobile number on the order.
          Undelivered orders are returned to us and rescheduled — we will contact you to arrange a
          new slot.
        </p>
      </Prose>
    </>
  )
}
