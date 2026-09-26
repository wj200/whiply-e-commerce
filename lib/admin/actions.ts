'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { prisma } from '@/lib/db/client'
import { requireAdmin } from '@/lib/auth/session'
import { recordAudit } from '@/lib/domain/audit'
import { transitionOrder } from '@/lib/domain/orders'
import { refundOrder, cancelOrder } from '@/lib/domain/refunds'
import { applyDeliveryStatus, rescheduleDelivery, OPERATOR_SETTABLE } from '@/lib/domain/fulfilment'
import { validateSlotChoice } from '@/lib/domain/delivery-slots'
import { getSlotRules } from '@/lib/domain/settings'
import { setSetting, invalidateSettings } from '@/lib/domain/settings'
import { SETTING_KEYS, type SettingKey } from '@/lib/domain/settings-schema'
import { normaliseCode } from '@/lib/domain/discounts'
import { sgtInstant } from '@/lib/domain/delivery-slots'
import type { DeliveryStatus, OrderStatus } from '@/lib/generated/prisma'

/**
 * Blueprint §11.3 — admin writes are Server Actions, not public REST routes,
 * so they are unreachable without a valid session cookie and are protected
 * against cross-site submission by the framework's action origin checks.
 *
 * EVERY action calls requireAdmin() independently. The layout check is a
 * convenience for rendering; this is the authorisation.
 */

export type ActionResult = { ok: boolean; error?: string }

async function actorIp(): Promise<string | null> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
}

// ─────────────────────────────── Orders ───────────────────────────────

export async function setOrderStatusAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin()
  const orderId = String(formData.get('orderId') ?? '')
  const to = String(formData.get('to') ?? '') as OrderStatus

  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) return { ok: false, error: 'Order not found.' }

  try {
    await prisma.$transaction(async (tx) => {
      await transitionOrder(tx, {
        orderId,
        from: order.orderStatus,
        to,
        actor: `admin:${session.email}`,
        type: to,
      })
    })
  } catch (error) {
    // The state machine refused it. That is the point (§19.2).
    return { ok: false, error: error instanceof Error ? error.message : 'Not permitted.' }
  }

  await recordAudit({
    actorId: session.id,
    actorLabel: session.email,
    entity: 'order',
    entityId: orderId,
    action: 'STATUS_CHANGE',
    before: { orderStatus: order.orderStatus },
    after: { orderStatus: to },
    ip: await actorIp(),
  })

  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return { ok: true }
}

export async function refundOrderAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin()
  const orderId = String(formData.get('orderId') ?? '')
  const reason = String(formData.get('reason') ?? '').trim() || 'No reason given'
  const restoreStock = formData.get('restoreStock') === 'on'

  const result = await refundOrder({
    orderId,
    actor: `admin:${session.email}`,
    restoreStock,
    reason,
  })

  await recordAudit({
    actorId: session.id,
    actorLabel: session.email,
    entity: 'order',
    entityId: orderId,
    action: 'REFUND',
    after: { restoreStock, reason, ok: result.ok },
    ip: await actorIp(),
  })

  revalidatePath(`/admin/orders/${orderId}`)
  return result.ok ? { ok: true } : { ok: false, error: result.reason }
}

export async function cancelOrderAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin()
  const orderId = String(formData.get('orderId') ?? '')
  const reason = String(formData.get('reason') ?? '').trim() || 'No reason given'

  const result = await cancelOrder({ orderId, actor: `admin:${session.email}`, reason })

  await recordAudit({
    actorId: session.id,
    actorLabel: session.email,
    entity: 'order',
    entityId: orderId,
    action: 'CANCEL',
    after: { reason, ok: result.ok },
    ip: await actorIp(),
  })

  revalidatePath(`/admin/orders/${orderId}`)
  return result.ok ? { ok: true } : { ok: false, error: result.reason }
}

// ────────────────────────────── Delivery ──────────────────────────────
//
// Fulfilment is self-managed (§7): there is no courier to book, so every
// action here is an operator recording what they have actually done. The
// domain still refuses an illegal move — these actions authorise and audit,
// they do not decide.

export async function advanceDeliveryAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin()
  const orderId = String(formData.get('orderId') ?? '')
  const status = String(formData.get('status') ?? '') as DeliveryStatus

  if (!OPERATOR_SETTABLE.includes(status)) {
    return { ok: false, error: 'That is not a delivery status an operator can set.' }
  }

  const courierRef = String(formData.get('courierRef') ?? '').trim()
  const notes = String(formData.get('notes') ?? '').trim()
  const failureReason = String(formData.get('failureReason') ?? '').trim()
  const costRaw = String(formData.get('costSgd') ?? '').trim()

  let actualCostCents: number | null = null
  if (costRaw) {
    const value = Number.parseFloat(costRaw)
    if (!Number.isFinite(value) || value < 0) return { ok: false, error: 'Invalid cost.' }
    actualCostCents = Math.round(value * 100)
  }

  if ((status === 'FAILED' || status === 'CANCELLED') && !failureReason) {
    // A failed delivery with no stated reason is a row nobody can act on.
    return { ok: false, error: 'Say why the delivery failed.' }
  }

  const outcome = await applyDeliveryStatus({
    orderId,
    status,
    actor: `admin:${session.email}`,
    ...(courierRef ? { courierRef } : {}),
    ...(notes ? { notes } : {}),
    ...(failureReason ? { failureReason } : {}),
    actualCostCents,
  })

  await recordAudit({
    actorId: session.id,
    actorLabel: session.email,
    entity: 'delivery',
    entityId: orderId,
    action: 'SET_DELIVERY_STATUS',
    after: { status, outcome: outcome.kind, courierRef: courierRef || null, actualCostCents },
    ip: await actorIp(),
  })

  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/deliveries')

  if (outcome.kind === 'APPLIED') return { ok: true }
  if (outcome.kind === 'DELIVERY_NOT_FOUND') {
    return { ok: false, error: 'This order has no delivery record yet.' }
  }
  if (outcome.kind === 'IGNORED_UNCHANGED') return { ok: true }
  return {
    ok: false,
    error: `Cannot move a delivery from ${outcome.current} back to ${outcome.incoming}.`,
  }
}

export async function rescheduleDeliveryAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin()
  const orderId = String(formData.get('orderId') ?? '')
  const method = String(formData.get('method') ?? 'STANDARD') as 'STANDARD' | 'EXPRESS'
  const slotStart = String(formData.get('slotStart') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()

  // The operator picks from the same generated set a customer would, so an
  // admin cannot quietly book a 3am slot either.
  const rules = await getSlotRules()
  const slot = validateSlotChoice({ method, startIso: slotStart, now: new Date(), rules })
  if (!slot.ok) return { ok: false, error: slot.message }

  const result = await rescheduleDelivery({
    orderId,
    start: slot.start,
    end: slot.end,
    actor: `admin:${session.email}`,
    reason,
  })

  await recordAudit({
    actorId: session.id,
    actorLabel: session.email,
    entity: 'delivery',
    entityId: orderId,
    action: 'RESCHEDULE_DELIVERY',
    after: { slotStart: slot.start.toISOString(), reason: reason || null },
    ip: await actorIp(),
  })

  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/deliveries')
  return result.ok ? { ok: true } : { ok: false, error: result.reason }
}

// ────────────────────────────── Products ──────────────────────────────

const productSchema = z.object({
  name: z.string().trim().min(2).max(200),
  cardLabel: z.string().trim().max(60).optional().or(z.literal('')),
  shortDesc: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  priceSgd: z.coerce.number().min(0).max(1_000_000),
  stockQty: z.coerce.number().int().min(0).max(1_000_000),
  lowStockAt: z.coerce.number().int().min(0).max(100_000),
  isActive: z.boolean(),
  stockReason: z.string().trim().max(200).optional().or(z.literal('')),
})

export async function updateProductAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin()
  const id = String(formData.get('id') ?? '')

  const parsed = productSchema.safeParse({
    name: formData.get('name'),
    cardLabel: formData.get('cardLabel'),
    shortDesc: formData.get('shortDesc'),
    description: formData.get('description'),
    priceSgd: formData.get('priceSgd'),
    stockQty: formData.get('stockQty'),
    lowStockAt: formData.get('lowStockAt'),
    isActive: formData.get('isActive') === 'on',
    stockReason: formData.get('stockReason'),
  })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const before = await prisma.product.findUnique({ where: { id } })
  if (!before) return { ok: false, error: 'Product not found.' }

  const priceCents = Math.round(parsed.data.priceSgd * 100)

  // §9.3 — a stock change asks for a reason, and the reason lands in the
  // audit log. Inventory that changes without explanation is inventory
  // nobody trusts.
  if (before.stockQty !== parsed.data.stockQty && !parsed.data.stockReason) {
    return { ok: false, error: 'Give a reason for the stock change.' }
  }

  const after = await prisma.product.update({
    where: { id },
    data: {
      name: parsed.data.name,
      cardLabel: parsed.data.cardLabel || null,
      shortDesc: parsed.data.shortDesc,
      description: parsed.data.description,
      priceCents,
      stockQty: parsed.data.stockQty,
      lowStockAt: parsed.data.lowStockAt,
      isActive: parsed.data.isActive,
    },
  })

  await recordAudit({
    actorId: session.id,
    actorLabel: session.email,
    entity: 'product',
    entityId: id,
    action: before.stockQty !== after.stockQty ? 'UPDATE_WITH_STOCK_CHANGE' : 'UPDATE',
    before: {
      priceCents: before.priceCents,
      stockQty: before.stockQty,
      isActive: before.isActive,
    },
    after: {
      priceCents: after.priceCents,
      stockQty: after.stockQty,
      isActive: after.isActive,
      stockReason: parsed.data.stockReason || null,
    },
    ip: await actorIp(),
  })

  // The storefront reads these rows directly, so a price change is visible
  // on the next request with no deploy (§4.5).
  revalidatePath('/', 'layout')
  return { ok: true }
}

// ────────────────────────────── Discounts ─────────────────────────────

/**
 * A `yyyy-mm-dd` from a date input, read as Singapore time rather than UTC.
 * Getting this wrong is an eight-hour window at each end of every campaign.
 */
function sgtStartOfDay(day: string): Date {
  return sgtInstant({ ...splitDay(day), hour: 0 })
}

function sgtEndOfDay(day: string): Date {
  // 00:00 on the following day: the last second of `day` is included.
  const { year, month, day: d } = splitDay(day)
  return new Date(sgtInstant({ year, month, day: d, hour: 0 }).getTime() + 24 * 60 * 60_000)
}

function splitDay(day: string): { year: number; month: number; day: number } {
  const [y, m, d] = day.split('-').map(Number)
  return { year: y ?? 1970, month: m ?? 1, day: d ?? 1 }
}

const codeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(32)
      .regex(/^[A-Za-z0-9_-]+$/, 'Letters, digits, - and _ only'),
    valueType: z.enum(['PERCENT', 'FIXED']),
    percentOff: z.coerce.number().int().min(1).max(100).optional(),
    valueSgd: z.coerce.number().min(0.01).optional(),
    limitType: z.enum(['TIME_LIMITED', 'USE_LIMITED', 'SEASONAL']),
    startsAt: z.string().optional().or(z.literal('')),
    expiresAt: z.string().optional().or(z.literal('')),
    maxUses: z.coerce.number().int().min(1).max(1_000_000).optional(),
    attributionLabel: z.string().trim().max(60).optional().or(z.literal('')),
    seasonLabel: z.string().trim().max(60).optional().or(z.literal('')),
  })
  .refine(
    (v) => (v.valueType === 'PERCENT' ? v.percentOff !== undefined : v.valueSgd !== undefined),
    { message: 'Give the discount value.' },
  )
  .refine(
    (v) => {
      if (v.limitType === 'TIME_LIMITED') return Boolean(v.expiresAt)
      if (v.limitType === 'USE_LIMITED') return v.maxUses !== undefined
      return Boolean(v.startsAt) && Boolean(v.expiresAt)
    },
    { message: 'Give an expiry date, a maximum number of uses, or a season window.' },
  )
  // Mirrors the database CHECK. Catching it here gives the operator a
  // sentence instead of a constraint violation.
  .refine(
    (v) =>
      v.limitType !== 'SEASONAL' ||
      !v.startsAt ||
      !v.expiresAt ||
      new Date(v.expiresAt) > new Date(v.startsAt),
    { message: 'A season must end after it starts.' },
  )
  .refine((v) => v.limitType !== 'SEASONAL' || Boolean(v.seasonLabel), {
    message: 'Name the season — it is what the customer is told when the code is not live.',
  })

export async function createDiscountAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin()

  const parsed = codeSchema.safeParse({
    code: formData.get('code'),
    valueType: formData.get('valueType'),
    percentOff: formData.get('percentOff') || undefined,
    valueSgd: formData.get('valueSgd') || undefined,
    limitType: formData.get('limitType'),
    startsAt: formData.get('startsAt'),
    expiresAt: formData.get('expiresAt'),
    maxUses: formData.get('maxUses') || undefined,
    attributionLabel: formData.get('attributionLabel'),
    seasonLabel: formData.get('seasonLabel'),
  })

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const d = parsed.data
  const code = normaliseCode(d.code)

  const existing = await prisma.discountCode.findUnique({ where: { code } })
  if (existing) return { ok: false, error: `${code} already exists.` }

  const created = await prisma.discountCode.create({
    data: {
      code,
      valueType: d.valueType,
      percentOff: d.valueType === 'PERCENT' ? (d.percentOff ?? null) : null,
      valueCents: d.valueType === 'FIXED' ? Math.round((d.valueSgd ?? 0) * 100) : null,
      limitType: d.limitType,
      // A seasonal window runs from the START of its first day to the END of
      // its last, in Singapore time. A date picker gives midnight UTC, which
      // is 8am local — a code that quietly does nothing all morning.
      startsAt: d.limitType === 'SEASONAL' && d.startsAt ? sgtStartOfDay(d.startsAt) : null,
      expiresAt:
        d.limitType === 'TIME_LIMITED' && d.expiresAt
          ? sgtEndOfDay(d.expiresAt)
          : d.limitType === 'SEASONAL' && d.expiresAt
            ? sgtEndOfDay(d.expiresAt)
            : null,
      maxUses: d.limitType === 'USE_LIMITED' ? (d.maxUses ?? null) : null,
      attributionLabel: d.attributionLabel || null,
      seasonLabel: d.limitType === 'SEASONAL' ? d.seasonLabel || null : null,
      isActive: true,
    },
  })

  await recordAudit({
    actorId: session.id,
    actorLabel: session.email,
    entity: 'discount_code',
    entityId: created.id,
    action: 'CREATE',
    after: {
      code,
      valueType: d.valueType,
      limitType: d.limitType,
      seasonLabel: d.seasonLabel || null,
    },
    ip: await actorIp(),
  })

  revalidatePath('/admin/discounts')
  return { ok: true }
}

export async function toggleDiscountAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin()
  const id = String(formData.get('id') ?? '')

  const before = await prisma.discountCode.findUnique({ where: { id } })
  if (!before) return { ok: false, error: 'Code not found.' }

  await prisma.discountCode.update({ where: { id }, data: { isActive: !before.isActive } })

  await recordAudit({
    actorId: session.id,
    actorLabel: session.email,
    entity: 'discount_code',
    entityId: id,
    action: before.isActive ? 'DISABLE' : 'ENABLE',
    before: { isActive: before.isActive },
    after: { isActive: !before.isActive },
    ip: await actorIp(),
  })

  revalidatePath('/admin/discounts')
  return { ok: true }
}

// ─────────────────────────────── Settings ─────────────────────────────

export async function updateSettingsAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin()
  const ip = await actorIp()

  const parsedValues: Partial<Record<SettingKey, unknown>> = {
    standard_delivery_fee_cents: Math.round(
      Number(formData.get('standardDeliveryFeeSgd') ?? 0) * 100,
    ),
    express_delivery_fee_cents: Math.round(
      Number(formData.get('expressDeliveryFeeSgd') ?? 0) * 100,
    ),
    free_delivery_threshold_cents: Math.round(
      Number(formData.get('freeDeliveryThresholdSgd') ?? 0) * 100,
    ),
    order_expiry_minutes: Number(formData.get('orderExpiryMinutes') ?? 120),
    low_stock_threshold_default: Number(formData.get('lowStockDefault') ?? 10),
    store_open: formData.get('storeOpen') === 'on',
    delivery_first_hour: Number(formData.get('deliveryFirstHour') ?? 10),
    delivery_last_slot_hour: Number(formData.get('deliveryLastSlotHour') ?? 22),
    delivery_lead_minutes: Number(formData.get('deliveryLeadMinutes') ?? 60),
    order_cutoff_hour: Number(formData.get('orderCutoffHour') ?? 22),
    express_window_minutes: Number(formData.get('expressWindowMinutes') ?? 120),
  }

  const line1 = String(formData.get('pickupLine1') ?? '').trim()
  if (line1) {
    parsedValues.pickup_address = {
      line1,
      line2: String(formData.get('pickupLine2') ?? '').trim(),
      postalCode: String(formData.get('pickupPostal') ?? '').trim(),
      contactName: String(formData.get('pickupContactName') ?? '').trim(),
      contactPhone: String(formData.get('pickupContactPhone') ?? '').trim(),
    }
  }

  const before = await prisma.setting.findMany()
  const beforeMap = Object.fromEntries(before.map((s) => [s.key, s.value]))

  for (const key of SETTING_KEYS) {
    if (!(key in parsedValues)) continue
    try {
      await setSetting(key, parsedValues[key], session.id)
    } catch (error) {
      return {
        ok: false,
        error: `${key}: ${error instanceof Error ? error.message : 'invalid value'}`,
      }
    }
  }

  invalidateSettings()

  await recordAudit({
    actorId: session.id,
    actorLabel: session.email,
    entity: 'settings',
    action: 'UPDATE',
    before: beforeMap,
    after: JSON.parse(JSON.stringify(parsedValues)),
    ip,
  })

  // Every surface that renders a fee or threshold updates on the next request.
  revalidatePath('/', 'layout')
  return { ok: true }
}

// ────────────────────────────── Enquiries ─────────────────────────────

export async function updateEnquiryAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin()
  const id = String(formData.get('id') ?? '')
  const status = String(formData.get('status') ?? '')
  const notes = String(formData.get('notes') ?? '')

  if (!['NEW', 'CONTACTED', 'CLOSED', 'SPAM'].includes(status)) {
    return { ok: false, error: 'Invalid status.' }
  }

  await prisma.enquiry.update({
    where: { id },
    data: { status: status as 'NEW' | 'CONTACTED' | 'CLOSED' | 'SPAM', notes: notes || null },
  })

  await recordAudit({
    actorId: session.id,
    actorLabel: session.email,
    entity: 'enquiry',
    entityId: id,
    action: 'UPDATE',
    after: { status },
    ip: await actorIp(),
  })

  revalidatePath('/admin/enquiries')
  return { ok: true }
}

export async function deleteEnquiryAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin()
  const id = String(formData.get('id') ?? '')

  await prisma.enquiry.delete({ where: { id } })

  // §8.5 — delete removes the row outright, which is also how a data-deletion
  // request is honoured.
  await recordAudit({
    actorId: session.id,
    actorLabel: session.email,
    entity: 'enquiry',
    entityId: id,
    action: 'DELETE',
    ip: await actorIp(),
  })

  revalidatePath('/admin/enquiries')
  return { ok: true }
}
