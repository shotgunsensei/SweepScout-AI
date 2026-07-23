import type { Request } from "express";
import { requireRequestAuth } from "@/lib/auth/session";
import type { EntryLog } from "@/lib/types";

export type AdminSession = {
  userId: string;
  mode: "local" | "supabase";
  label: string;
  role: "owner" | "admin";
};

export class AdminAccessError extends Error {
  constructor(message = "Admin access required.") {
    super(message);
    this.name = "AdminAccessError";
  }
}

export async function getAdminSession(req: Request): Promise<AdminSession | null> {
  const auth = requireRequestAuth(req);
  if (auth.platformRole !== "owner" && auth.platformRole !== "admin") return null;
  return {
    userId: auth.userId,
    mode: auth.mode,
    label: auth.email,
    role: auth.platformRole,
  };
}

export async function requireOwner(req: Request) {
  const session = await requireAdmin(req);
  if (session.role !== "owner") throw new AdminAccessError("Platform owner access required.");
  return session;
}

export async function requireAdmin(req: Request) {
  const session = await getAdminSession(req);
  if (!session) {
    throw new AdminAccessError();
  }
  return session;
}

export function entriesToCsv(entries: EntryLog[]) {
  const headers = [
    "id",
    "organization_id",
    "sweepstake_id",
    "sweepstake_title",
    "status",
    "attempted_at",
    "submitted_at",
    "confirmation_code",
    "email_alias",
    "time_spent_minutes",
    "prefill_saved_minutes",
    "form_url",
    "screenshot_path",
    "user_approved",
    "purchase_required_acknowledged",
    "notes",
  ];

  const rows = entries.map((entry) => [
    entry.id,
    entry.organizationId,
    entry.sweepstakeId,
    entry.sweepstakeTitle,
    entry.status,
    entry.attemptedAt,
    entry.submittedAt ?? "",
    entry.confirmationCode ?? "",
    entry.emailAlias ?? "",
    String(entry.timeSpentMinutes ?? ""),
    String(entry.prefillSavedMinutes ?? ""),
    entry.formUrl ?? "",
    entry.screenshotPath ?? "",
    String(entry.userApproved),
    String(entry.purchaseRequiredAcknowledged),
    entry.notes,
  ]);

  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}
