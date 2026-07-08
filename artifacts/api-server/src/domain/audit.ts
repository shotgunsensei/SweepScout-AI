import { randomUUID } from "node:crypto";
import { DEFAULT_ORGANIZATION_ID } from "@/lib/services/tenancy";
import { getStore } from "@/lib/storage/store";
import type { AuditLog } from "@/lib/types";

export type AuditLogInput = Omit<AuditLog, "id" | "createdAt" | "organizationId"> & {
  id?: string;
  createdAt?: string;
  organizationId?: string;
};

export async function writeAuditLog(input: AuditLogInput) {
  const log: AuditLog = {
    id: input.id ?? randomUUID(),
    organizationId: input.organizationId ?? DEFAULT_ORGANIZATION_ID,
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    severity: input.severity,
    message: input.message,
    metadata: input.metadata,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };

  try {
    const store = await getStore();
    await store.saveAuditLog(log);
  } catch (error) {
    console.warn("[audit] Could not persist audit log:", error instanceof Error ? error.message : "Unknown error");
  }

  return log;
}
