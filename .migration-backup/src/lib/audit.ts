import { randomUUID } from "node:crypto";
import { getStore } from "@/lib/storage/store";
import type { AuditLog } from "@/lib/types";

export type AuditLogInput = Omit<AuditLog, "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};

export async function writeAuditLog(input: AuditLogInput) {
  const log: AuditLog = {
    id: input.id ?? randomUUID(),
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
