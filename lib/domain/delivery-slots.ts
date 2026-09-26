/**
 * Blueprint §7.2 — DELIVERY SPEEDS AND BOOKABLE SLOTS.
 *
 * Pure and synchronous: no I/O, no Prisma, no `server-only`. The checkout
 * route, the admin console and the unit tests all reason about slots through
 * this one module, so "is this slot still bookable" cannot be answered two
 * different ways.
 *
 * Singapore Standard Time is UTC+8 all year and has never observed daylight
 * saving. The conversions below are therefore a fixed offset rather than an
 * `Intl` round-trip — exact, testable, and free of the off-by-one hour that
 * timezone-database lookups introduce at boundaries.
 */

export const SGT_OFFSET_MINUTES = 8 * 60

export type DeliveryMethodName = 'STANDARD' | 'EXPRESS'

export type SlotRules = {
  /** First slot of the day, as an hour in SGT. */
  firstHour: number
  /** Start hour of the LAST slot of the day, in SGT. Each slot is an hour. */
  lastStartHour: number
  /** A slot must start at least this many minutes from now. */
  leadMinutes: number
  /** After this hour (SGT) the website stops accepting orders entirely. */
  orderCutoffHour: number
  /** Express promises delivery within this many minutes. */
  expressWindowMinutes: number
  /** Standard delivery lands between these two working-day offsets. */
  standardMinWorkingDays: number
  standardMaxWorkingDays: number
}

export const DEFAULT_SLOT_RULES: SlotRules = {
  firstHour: 10, // 10am
  lastStartHour: 22, // last slot runs 10pm–11pm
  leadMinutes: 60,
  orderCutoffHour: 22, // no orders accepted from 10pm
  expressWindowMinutes: 120,
  standardMinWorkingDays: 2,
  standardMaxWorkingDays: 3,
}

export type Slot = {
  /** UTC instants. The database stores timestamptz; SGT is a display concern. */
  start: Date
  end: Date
  /** `2026-09-26` in SGT — the grouping key the picker uses. */
  dateKey: string
  /** `10:00 – 11:00` in SGT. */
  label: string
}

// ── SGT calendar arithmetic ──────────────────────────────────────────

/** The wall-clock fields an instant has in Singapore. */
export function sgtParts(instant: Date): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: number
} {
  const shifted = new Date(instant.getTime() + SGT_OFFSET_MINUTES * 60_000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(), // 0 = Sunday
  }
}

/** The instant at which a given SGT wall-clock time occurs. */
export function sgtInstant(input: {
  year: number
  month: number
  day: number
  hour: number
  minute?: number
}): Date {
  const asUtc = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute ?? 0, 0, 0)
  return new Date(asUtc - SGT_OFFSET_MINUTES * 60_000)
}

export function sgtDateKey(instant: Date): string {
  const p = sgtParts(instant)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

export function formatSgtTime(instant: Date): string {
  const p = sgtParts(instant)
  const suffix = p.hour >= 12 ? 'pm' : 'am'
  const twelve = p.hour % 12 === 0 ? 12 : p.hour % 12
  return p.minute === 0
    ? `${twelve}${suffix}`
    : `${twelve}:${String(p.minute).padStart(2, '0')}${suffix}`
}

export function formatSlot(slot: { start: Date; end: Date }): string {
  return `${formatSgtTime(slot.start)} – ${formatSgtTime(slot.end)}`
}

/** Long form for a receipt: "Sat 26 Sep, 10am – 11am". */
export function formatSlotWithDate(slot: { start: Date; end: Date }): string {
  const p = sgtParts(slot.start)
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][p.weekday]
  const month = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ][p.month - 1]
  return `${weekday} ${p.day} ${month}, ${formatSlot(slot)}`
}

function isWorkingDay(weekday: number): boolean {
  return weekday >= 1 && weekday <= 5
}

/**
 * Public holidays are NOT modelled. Singapore has eleven gazetted holidays a
 * year and encoding them here would be a table that silently goes stale; the
 * operator closes the store for the day instead (`store_open`). Recorded in
 * §17.4 as a known limitation rather than left to be discovered.
 */
export function addWorkingDays(from: Date, days: number): Date {
  let cursor = from
  let remaining = days
  while (remaining > 0) {
    cursor = new Date(cursor.getTime() + 24 * 60 * 60_000)
    if (isWorkingDay(sgtParts(cursor).weekday)) remaining -= 1
  }
  return cursor
}

// ── The ordering window ──────────────────────────────────────────────

export type OrderingWindow =
  | { open: true }
  | { open: false; reason: 'BEFORE_OPENING' | 'AFTER_CUTOFF'; message: string }

/**
 * The website itself closes at the cutoff hour. This is separate from
 * `store_open`, which is the operator's manual switch: this one is the clock.
 */
export function orderingWindow(now: Date, rules: SlotRules = DEFAULT_SLOT_RULES): OrderingWindow {
  const { hour } = sgtParts(now)
  if (hour >= rules.orderCutoffHour) {
    return {
      open: false,
      reason: 'AFTER_CUTOFF',
      message: `Orders close at ${hourLabel(rules.orderCutoffHour)}. We reopen at ${hourLabel(rules.firstHour)} tomorrow.`,
    }
  }
  if (hour < rules.firstHour) {
    return {
      open: false,
      reason: 'BEFORE_OPENING',
      message: `Orders open at ${hourLabel(rules.firstHour)}.`,
    }
  }
  return { open: true }
}

function hourLabel(hour: number): string {
  const suffix = hour >= 12 ? 'pm' : 'am'
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve}${suffix}`
}

// ── Slot generation ──────────────────────────────────────────────────

function slotsOnDay(dayAnchor: Date, rules: SlotRules): Slot[] {
  const p = sgtParts(dayAnchor)
  const out: Slot[] = []
  for (let hour = rules.firstHour; hour <= rules.lastStartHour; hour += 1) {
    const start = sgtInstant({ year: p.year, month: p.month, day: p.day, hour })
    const end = new Date(start.getTime() + 60 * 60_000)
    out.push({ start, end, dateKey: sgtDateKey(start), label: formatSlot({ start, end }) })
  }
  return out
}

/**
 * The slots a customer may pick, for a given speed, at a given moment.
 *
 * EXPRESS is same-day and bounded by the promise on the price list: a slot
 * must start at least `leadMinutes` from now AND begin within
 * `expressWindowMinutes`. Late in the evening that list is legitimately
 * empty — the last slot starts at 10pm, so express stops being offered from
 * 9pm even though the site keeps taking standard orders until 10pm.
 *
 * STANDARD lands 2–3 working days out, and every slot on those days is
 * offered because none of them is close enough to now for lead time to bite.
 */
export function availableSlots(input: {
  method: DeliveryMethodName
  now: Date
  rules?: SlotRules
}): Slot[] {
  const rules = input.rules ?? DEFAULT_SLOT_RULES
  const earliest = new Date(input.now.getTime() + rules.leadMinutes * 60_000)

  if (input.method === 'EXPRESS') {
    const latest = new Date(input.now.getTime() + rules.expressWindowMinutes * 60_000)
    return slotsOnDay(input.now, rules).filter(
      (slot) => slot.start >= earliest && slot.start <= latest,
    )
  }

  const out: Slot[] = []
  for (let d = rules.standardMinWorkingDays; d <= rules.standardMaxWorkingDays; d += 1) {
    const day = addWorkingDays(input.now, d)
    for (const slot of slotsOnDay(day, rules)) {
      if (slot.start >= earliest) out.push(slot)
    }
  }
  return out
}

export type SlotValidation =
  | { ok: true; start: Date; end: Date }
  | {
      ok: false
      reason: 'NOT_A_SLOT' | 'TOO_SOON' | 'OUT_OF_RANGE' | 'MISSING'
      message: string
    }

/**
 * GUARD-1 applied to time: the client sends a slot start, and the server
 * re-derives the whole set and checks membership. A hand-crafted request for
 * a 3am delivery, or for a slot forty seconds away, is refused here — not in
 * the picker component, which is a courtesy rather than a control.
 */
export function validateSlotChoice(input: {
  method: DeliveryMethodName
  startIso: string | null | undefined
  now: Date
  rules?: SlotRules
}): SlotValidation {
  const rules = input.rules ?? DEFAULT_SLOT_RULES

  if (!input.startIso) {
    return { ok: false, reason: 'MISSING', message: 'Choose a delivery slot.' }
  }

  const start = new Date(input.startIso)
  if (Number.isNaN(start.getTime())) {
    return { ok: false, reason: 'NOT_A_SLOT', message: 'That delivery slot is not valid.' }
  }

  const options = availableSlots({ method: input.method, now: input.now, rules })
  const match = options.find((slot) => slot.start.getTime() === start.getTime())

  if (match) return { ok: true, start: match.start, end: match.end }

  // Distinguish the two failures a customer can actually cause, so the error
  // tells them something they can act on.
  const earliest = new Date(input.now.getTime() + rules.leadMinutes * 60_000)
  if (start < earliest) {
    return {
      ok: false,
      reason: 'TOO_SOON',
      message: `Slots must be booked at least ${rules.leadMinutes} minutes ahead. Please pick a later one.`,
    }
  }

  return {
    ok: false,
    reason: 'OUT_OF_RANGE',
    message: 'That delivery slot is no longer available. Please pick another.',
  }
}
