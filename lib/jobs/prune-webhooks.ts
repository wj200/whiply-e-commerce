import 'server-only'
import { prisma } from '@/lib/db/client'

/**
 * Blueprint §10.5 — webhook_events rows exist only to de-duplicate retries
 * that stopped long ago. Ninety days is generous for every provider involved.
 */
const RETENTION_DAYS = 90

export async function pruneWebhookEvents(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600_000)
  const { count } = await prisma.webhookEvent.deleteMany({
    where: { receivedAt: { lte: cutoff } },
  })
  return count
}
