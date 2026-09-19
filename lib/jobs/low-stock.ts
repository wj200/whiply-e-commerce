import 'server-only'
import { prisma } from '@/lib/db/client'
import { sendOperatorEmail } from '@/lib/notify/operator-email'
import { logger } from '@/lib/observability/logger'

/**
 * Blueprint §11.4 — low-stock alert to the operator. At most one alert per
 * product per day, so a slow-selling product does not become noise.
 */
const ALERT_INTERVAL_HOURS = 24

export async function reportLowStock(): Promise<{ lowStock: number; alerted: number }> {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, sku: true, name: true, stockQty: true, lowStockAt: true },
  })

  const low = products.filter((p) => p.stockQty <= p.lowStockAt)
  if (low.length === 0) return { lowStock: 0, alerted: 0 }

  const cutoff = new Date(Date.now() - ALERT_INTERVAL_HOURS * 3600_000)
  const recentlyAlerted = await prisma.auditLog.findMany({
    where: { entity: 'product', action: 'LOW_STOCK_ALERT', createdAt: { gte: cutoff } },
    select: { entityId: true },
  })
  const alreadyAlerted = new Set(recentlyAlerted.map((r) => r.entityId))

  const toAlert = low.filter((p) => !alreadyAlerted.has(p.id))
  if (toAlert.length === 0) return { lowStock: low.length, alerted: 0 }

  const lines = toAlert
    .map((p) => `• ${p.name} (${p.sku}) — ${p.stockQty} left, threshold ${p.lowStockAt}`)
    .join('\n')

  await sendOperatorEmail({
    subject: `WHIPLY: ${toAlert.length} product${toAlert.length === 1 ? '' : 's'} low on stock`,
    text: `The following products are at or below their low-stock threshold:\n\n${lines}\n\nRestock from Admin → Products.`,
  })

  await prisma.auditLog.createMany({
    data: toAlert.map((p) => ({
      actorLabel: 'system:low-stock',
      entity: 'product',
      entityId: p.id,
      action: 'LOW_STOCK_ALERT',
      after: { stockQty: p.stockQty, lowStockAt: p.lowStockAt },
    })),
  })

  logger.warn('stock.low', { skus: toAlert.map((p) => p.sku) })
  return { lowStock: low.length, alerted: toAlert.length }
}
