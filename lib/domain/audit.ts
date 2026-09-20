import 'server-only'
import { prisma, type Prisma } from '@/lib/db/client'

/**
 * Blueprint §9.8 — the audit log: the story of one OPERATOR.
 *
 * Separate from order events, which are the story of one ORDER. Together they
 * answer the two questions that actually get asked after something goes
 * wrong: what happened to this order, and who changed that.
 *
 * Neither is editable from the UI.
 */
export async function recordAudit(input: {
  actorId?: string | null
  actorLabel: string
  entity: string
  entityId?: string | null
  action: string
  before?: Prisma.InputJsonValue
  after?: Prisma.InputJsonValue
  ip?: string | null
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      actorLabel: input.actorLabel,
      entity: input.entity,
      entityId: input.entityId ?? null,
      action: input.action,
      before: input.before ?? undefined,
      after: input.after ?? undefined,
      ip: input.ip ?? null,
    },
  })
}

export async function listAudit(opts: { entity?: string; entityId?: string; limit?: number } = {}) {
  return prisma.auditLog.findMany({
    where: {
      ...(opts.entity ? { entity: opts.entity } : {}),
      ...(opts.entityId ? { entityId: opts.entityId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: opts.limit ?? 100,
  })
}
