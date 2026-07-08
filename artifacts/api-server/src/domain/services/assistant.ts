import { writeAuditLog } from "@/lib/audit";
import { markEntryStatus } from "@/lib/services/entry-tracking";
import { getStore } from "@/lib/storage/store";

export async function approveAssistantTask(taskId: string) {
  const store = await getStore();
  const task = await store.getAssistantTask(taskId);
  if (!task) {
    throw new Error("Assistant task not found.");
  }

  const updated = {
    ...task,
    status: "approved" as const,
    approvedAt: new Date().toISOString(),
  };
  await store.saveAssistantTask(updated);
  await writeAuditLog({
    actorId: null,
    action: "assistant_task.approved",
    entityType: "assistant_task",
    entityId: updated.id,
    severity: "info",
    message: "Assistant staging task approved by the user.",
    metadata: { sweepstakeId: updated.sweepstakeId, requiresApproval: updated.requiresApproval },
  });
  return updated;
}

export async function recordEntryAttempt(input: {
  sweepstakeId: string;
  userApproved: boolean;
  reviewConfirmed: boolean;
  purchaseRequiredAcknowledged: boolean;
  timeSpentMinutes?: number;
  notes?: string;
}) {
  return markEntryStatus({
    sweepstakeId: input.sweepstakeId,
    status: "submitted",
    userApproved: input.userApproved,
    reviewConfirmed: input.reviewConfirmed,
    purchaseRequiredAcknowledged: input.purchaseRequiredAcknowledged,
    timeSpentMinutes: input.timeSpentMinutes,
    notes: input.notes,
  });
}
