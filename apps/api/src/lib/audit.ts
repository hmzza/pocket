import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

type AuditInput = {
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  payload?: unknown;
};

export async function writeAuditLog(input: AuditInput) {
  return prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      payload: input.payload as Prisma.InputJsonValue | undefined
    }
  });
}
