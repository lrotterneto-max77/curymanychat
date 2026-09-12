import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma";


interface AuditParams {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Auditoria append-only. Nunca deletar registros aqui — apenas inserir.
 */
export async function recordAuditLog(params: AuditParams) {
  await prisma.auditLog.create({
    data: {
      userId: params.userId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      metadata: params.metadata ?? {},
    },
  });
}
