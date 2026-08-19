import { createClient, type User } from "@supabase/supabase-js";

const url = required("SUPABASE_URL");
const anonKey = required("SUPABASE_ANON_KEY");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const email = required("PLATFORM_OWNER_EMAIL").trim().toLowerCase();
const appBaseUrl = safeBaseUrl(required("APP_BASE_URL"));
const service = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const existing = await findUser(email);
const existingProfile = existing ? await loadProfile(existing.id) : null;
if (existingProfile?.platform_role === "owner" && !existingProfile.account_disabled_at && !existingProfile.account_removed_at) {
  process.stdout.write(`Platform owner access is already active for ${email}; no changes or recovery email were requested.\n`);
  process.exit(0);
}
if (existingProfile?.account_disabled_at || existingProfile?.account_removed_at) {
  throw new Error("The matching account was disabled or removed and will not be reactivated by the bootstrap command.");
}
const invitation = existing
  ? null
  : await service.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${appBaseUrl}/auth/callback`,
      data: { display_name: email.split("@")[0] },
    });
if (invitation?.error) throw new Error(`Unable to invite the platform owner: ${invitation.error.message}`);
const user = existing ?? invitation?.data.user;
if (!user) throw new Error("Supabase did not return the platform owner account.");

const now = new Date().toISOString();
const displayName = cleanDisplayName(user);
check(await service.from("profiles").upsert({
  id: user.id,
  email,
  display_name: displayName,
  platform_role: "owner",
  account_disabled_at: null,
  account_removed_at: null,
  updated_at: now,
}, { onConflict: "id" }), "Unable to create the owner profile. Apply all database migrations first.");

const [preferences, eligibility, subscription] = await Promise.all([
  service.from("user_preferences").upsert({ user_id: user.id, updated_at: now }, { onConflict: "user_id", ignoreDuplicates: true }),
  service.from("user_eligibility_profiles").upsert({ user_id: user.id, updated_at: now }, { onConflict: "user_id", ignoreDuplicates: true }),
  service.from("subscriptions").upsert({
    user_id: user.id,
    provider_subscription_id: null,
    provider_price_id: null,
    plan_key: "free_flight",
    status: "none",
    updated_at: now,
  }, { onConflict: "user_id", ignoreDuplicates: true }),
]);
check(preferences, "Unable to initialize owner preferences.");
check(eligibility, "Unable to initialize owner eligibility.");
check(subscription, "Unable to initialize the owner subscription.");

check(await service.from("admin_audit_logs").insert({
  actor_user_id: user.id,
  actor_role: "owner",
  action: existing ? "owner.bootstrap_promoted" : "owner.bootstrap_invited",
  target_type: "profile",
  target_id: user.id,
  before_state: null,
  after_state: { email, platformRole: "owner", invitationSent: !existing },
  reason: "Initial platform owner bootstrap.",
  correlation_id: `owner-bootstrap-${now}`,
}), "Unable to record the owner bootstrap audit event.");

if (existing) {
  const publicClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const recovery = await publicClient.auth.resetPasswordForEmail(email, {
    redirectTo: `${appBaseUrl}/reset-password`,
  });
  if (recovery.error) throw new Error(`Owner access is configured, but the password reset email could not be sent: ${recovery.error.message}`);
}

process.stdout.write(existing
  ? `Platform owner access verified for ${email}; a secure password reset email was requested.\n`
  : `Platform owner access created for ${email}; a secure invitation email was requested.\n`);

async function findUser(targetEmail: string) {
  for (let page = 1; page <= 100; page += 1) {
    const result = await service.auth.admin.listUsers({ page, perPage: 100 });
    if (result.error) throw new Error(`Unable to inspect Supabase users: ${result.error.message}`);
    const match = result.data.users.find((candidate) => candidate.email?.trim().toLowerCase() === targetEmail);
    if (match) return match;
    if (result.data.users.length < 100) return null;
  }
  throw new Error("Unable to locate the owner account within the Supabase user limit.");
}

async function loadProfile(userId: string) {
  const result = await service.from("profiles")
    .select("platform_role,account_disabled_at,account_removed_at")
    .eq("id", userId)
    .maybeSingle();
  if (result.error) throw new Error(`Unable to inspect the existing owner profile: ${result.error.message}`);
  return result.data;
}

function cleanDisplayName(user: User) {
  const supplied = user.user_metadata?.display_name;
  return typeof supplied === "string" && supplied.trim()
    ? supplied.trim().slice(0, 120)
    : email.split("@")[0]!.slice(0, 120);
}

function check(result: { error: { message?: string } | null }, message: string) {
  if (result.error) throw new Error(`${message} ${result.error.message ?? ""}`.trim());
}

function required(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} must be configured before provisioning the platform owner.`);
  return value;
}

function safeBaseUrl(value: string) {
  const parsed = new URL(value.split(",")[0]!.trim());
  if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("APP_BASE_URL must use HTTP or HTTPS.");
  return parsed.origin;
}