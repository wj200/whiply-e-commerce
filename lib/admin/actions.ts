'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { prisma } from '@/lib/db/client'
import { requireAdmin } from '@/lib/auth/session'
import { recordAudit } from '@/lib/domain/audit'
import { transitionOrder } from '@/lib/domain/orders'
import { refundOrder, cancelOrder } from '@/lib/domain/refunds'
import {
  bookDeliveryManually,
  recordManualDelivery,
  advanceManualDelivery,
  cancelDeliveryBooking,
} from '@/lib/domain/manual-delivery'
import { setSetting, invalidateSettings } from '@/lib/domain/settings'
import { SETTING_KEYS, type SettingKey } from '@/lib/domain/settings-schema'
import { normaliseCode } from '@/lib/domain/discounts'
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

export async function bookCourierAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin()
  const orderId = String(formData.get('orderId') ?? '')

  const outcome = await bookDeliveryManually({ orderId, actor: `admin:${session.email}` })

  await recordAudit({
    actorId: session.id,
    actorLabel: session.email,
    entity: 'delivery',
    entityId: orderId,
    action: 'BOOK_COURIER',
    after: { outcome: outcome.kind },
    ip: await actorIp(),
  })

  revalidatePath(`/admin/orders/${orderId}`)
  if (outcome.kind === 'BOOKED') return { ok: true }
  if (outcome.kind === 'ALREADY_BOOKED') return { ok: false, error: 'Already booked.' }
  if (outcome.kind === 'BLOCKED') return { ok: false, error: outcome.reason }
  if (outcome.kind === 'FAILED') return { ok: false, error: outcome.reason }
  return { ok: false, error: `Not dispatchable (${outcome.kind}).` }
}

export async function recordManualDeliveryAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin()
  const orderId = String(formData.get('orderId') ?? '')
  const reference = String(formData.get('reference') ?? '').trim()
  const costRaw = String(formData.get('costSgd') ?? '').trim()

  if (!reference) return { ok: false, error: 'A reference is required.' }

  let actualCostCents: number | null = null
  if (costRaw) {
    const value = Number.parseFloat(costRaw)
    if (!Number.isFinite(value) || value < 0) return { ok: false, error: 'Invalid cost.' }
    actualCostCents = Math.round(value * 100)
  }

  const result = await recordManualDelivery({
    orderId,
    actor: `admin:${session.email}`,
    reference,
    actualCostCents,
  })

  await recordAudit({
    actorId: session.id,
    actorLabel: session.email,
    entity: 'delivery',
    entityId: orderId,
    action: 'RECORD_MANUAL_DELIVERY',
    after: { reference, actualCostCents },
    ip: await actorIp(),
  })

  revalidatePath(`/admin/orders/${orderId}`)
  return result.ok ? { ok: true } : { ok: false, error: result.reason }
}

export async function advanceDeliveryAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin()
  const orderId = String(formData.get('orderId') ?? '')
  const status = String(formData.get('status') ?? '') as DeliveryStatus

  const result = await advanceManualDelivery({
    orderId,
    status,
    actor: `admin:${session.email}`,
  })

  revalidatePath(`/admin/orders/${orderId}`)
  return result.ok ? { ok: true } : { ok: false, error: result.reason }
}

export async function cancelCourierAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin()
  const orderId = String(formData.get('orderId') ?? '')
  const reason = String(formData.get('reason') ?? '').trim() || 'Cancelled by operator'

  const result = await cancelDeliveryBooking({
    orderId,
    actor: `admin:${session.email}`,
    reason,
  })

  revalidatePath(`/admin/orders/${orderId}`)
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
    limitType: z.enum(['TIME_LIMITED', 'USE_LIMITED']),
    expiresAt: z.string().optional().or(z.literal('')),
    maxUses: z.coerce.number().int().min(1).max(1_000_000).optional(),
    attributionLabel: z.string().trim().max(60).optional().or(z.literal('')),
  })
  .refine(
    (v) => (v.valueType === 'PERCENT' ? v.percentOff !== undefined : v.valueSgd !== undefined),
    { message: 'Give the discount value.' },
  )
  .refine((v) => (v.limitType === 'TIME_LIMITED' ? Boolean(v.expiresAt) : v.maxUses !== undefined), {
    message: 'Give an expiry date or a maximum number of uses.',
  })

export async function createDiscountAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin()

  const parsed = codeSchema.safeParse({
    code: formData.get('code'),
    valueType: formData.get('valueType'),
    percentOff: formData.get('percentOff') || undefined,
    valueSgd: formData.get('valueSgd') || undefined,
    limitType: formData.get('limitType'),
    expiresAt: formData.get('expiresAt'),
    maxUses: formData.get('maxUses') || undefined,
    attributionLabel: formData.get('attributionLabel'),
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
      expiresAt: d.limitType === 'TIME_LIMITED' && d.expiresAt ? new Date(d.expiresAt) : null,
      maxUses: d.limitType === 'USE_LIMITED' ? (d.maxUses ?? null) : null,
      attributionLabel: d.attributionLabel || null,
      isActive: true,
    },
  })

  await recordAudit({
    actorId: session.id,
    actorLabel: session.email,
    entity: 'discount_code',
    entityId: created.id,
    action: 'CREATE',
    after: { code, valueType: d.valueType, limitType: d.limitType },
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
    delivery_fee_cents: Math.round(Number(formData.get('deliveryFeeSgd') ?? 0) * 100),
    free_delivery_threshold_cents: Math.round(
      Number(formData.get('freeDeliveryThresholdSgd') ?? 0) * 100,
    ),
    auto_dispatch_enabled: formData.get('autoDispatch') === 'on',
    order_expiry_minutes: Number(formData.get('orderExpiryMinutes') ?? 120),
    low_stock_threshold_default: Number(formData.get('lowStockDefault') ?? 10),
    store_open: formData.get('storeOpen') === 'on',
    lalamove_vehicle_type: String(formData.get('vehicleType') ?? 'MOTORCYCLE'),
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
