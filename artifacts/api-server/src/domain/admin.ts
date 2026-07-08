import { createSupabaseAuthClient } from "@/lib/supabase/auth";
import { getAppConfig } from "@/lib/env";
import type { EntryLog } from "@/lib/types";

export type AdminSession = {
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

export async function getAdminSession(): Promise<AdminSession | null> {
  const config = getAppConfig();
  if (!config.supabaseConfigured) {
    if (process.env.NODE_ENV !== "production" || process.env.SWEEPSCOUT_LOCAL_ADMIN === "true") {
      return { mode: "local", label: "Local owner", role: "owner" };
    }
    return null;
  }

  const supabase = await createSupabaseAuthClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const role = adminRoleFromMetadata(data.user.app_metadata);
  const emailAllowed = listFromEnv("SWEEPSCOUT_ADMIN_EMAILS").includes((data.user.email ?? "").toLowerCase());
  const idAllowed = listFromEnv("SWEEPSCOUT_ADMIN_USER_IDS").includes(data.user.id.toLowerCase());

  if (!role && !emailAllowed && !idAllowed) {
    return null;
  }

  return {
    mode: "supabase",
    label: data.user.email ?? data.user.id,
    role: role ?? "admin",
  };
}

export async function requireAdmin() {
  const session = await getAdminSession();
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

function adminRoleFromMetadata(metadata: Record<string, unknown>) {
  const directRole = stringFrom(metadata.role) ?? stringFrom(metadata.sweepscout_role);
  if (directRole === "owner" || directRole === "admin") {
    return directRole;
  }

  const roles = metadata.roles;
  if (Array.isArray(roles) && roles.some((role) => role === "owner")) return "owner";
  if (Array.isArray(roles) && roles.some((role) => role === "admin")) return "admin";

  return null;
}

function listFromEnv(key: string) {
  return (process.env[key] ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function stringFrom(value: unknown) {
  return typeof value === "string" ? value.toLowerCase() : null;
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}
