import { getStore } from "@/lib/storage/store";
import type {
  BillingSubscription,
  Organization,
  OrganizationMembership,
  PlanLimits,
  PlanTier,
  SaaSAdminSummary,
  UsageSnapshot,
} from "@/lib/types";

export const DEFAULT_ORGANIZATION_ID = "org-default";
export const DEFAULT_USER_ID = "user-local-owner";

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    tier: "free",
    name: "Free",
    monthlyPriceUsd: 0,
    manualTracker: true,
    discovery: false,
    scoring: false,
    prefill: false,
    inboxMonitoring: false,
    browserExtension: false,
    advancedReporting: false,
    savedSweepstakes: 25,
    discoveryJobsPerMonth: 0,
  },
  pro: {
    tier: "pro",
    name: "Pro",
    monthlyPriceUsd: 19,
    manualTracker: true,
    discovery: true,
    scoring: true,
    prefill: true,
    inboxMonitoring: false,
    browserExtension: false,
    advancedReporting: false,
    savedSweepstakes: 500,
    discoveryJobsPerMonth: 50,
  },
  power: {
    tier: "power",
    name: "Power",
    monthlyPriceUsd: 49,
    manualTracker: true,
    discovery: true,
    scoring: true,
    prefill: true,
    inboxMonitoring: true,
    browserExtension: true,
    advancedReporting: true,
    savedSweepstakes: 5_000,
    discoveryJobsPerMonth: 250,
  },
};

export function getPlanLimits(tier: PlanTier | null | undefined) {
  return PLAN_LIMITS[tier ?? "free"] ?? PLAN_LIMITS.free;
}

export function normalizePlanTier(value: unknown): PlanTier {
  return value === "power" || value === "pro" || value === "free" ? value : "free";
}

export async function getActiveTenant() {
  const store = await getStore();
  const [organization, membership, subscription, usage] = await Promise.all([
    store.getActiveOrganization(),
    store.getActiveMembership(),
    store.getBillingSubscription(),
    getUsageSnapshot(),
  ]);
  return { organization, membership, subscription, usage };
}

export async function getUsageSnapshot(): Promise<UsageSnapshot> {
  const store = await getStore();
  const [organization, subscription, sweepstakes, discoveryJobs] = await Promise.all([
    store.getActiveOrganization(),
    store.getBillingSubscription(),
    store.listSweepstakes(),
    store.listDiscoveryJobs(),
  ]);
  const tier = normalizePlanTier(subscription.tier || organization.planTier);
  const limits = getPlanLimits(tier);
  const period = currentUsagePeriod();
  return {
    organizationId: organization.id,
    tier,
    limits,
    savedSweepstakes: sweepstakes.length,
    discoveryJobsThisMonth: discoveryJobs.filter((job) => {
      const startedAt = job.lastRunAt ?? job.createdAt;
      const time = new Date(startedAt).getTime();
      return Number.isFinite(time) && time >= period.start.getTime() && time < period.end.getTime();
    }).length,
    usagePeriodStart: period.start.toISOString(),
    usagePeriodEnd: period.end.toISOString(),
  };
}

export async function assertFeatureAllowed(feature: keyof Pick<PlanLimits, "discovery" | "scoring" | "prefill" | "inboxMonitoring" | "browserExtension" | "advancedReporting">) {
  const usage = await getUsageSnapshot();
  if (!usage.limits[feature]) {
    throw new Error(`${usage.limits.name} plan does not include ${featureLabel(feature)}. Upgrade is required.`);
  }
  return usage;
}

export async function assertCanCreateDiscoveryJob() {
  const usage = await assertFeatureAllowed("discovery");
  if (usage.discoveryJobsThisMonth >= usage.limits.discoveryJobsPerMonth) {
    throw new Error(
      `${usage.limits.name} plan discovery job limit reached (${usage.discoveryJobsThisMonth}/${usage.limits.discoveryJobsPerMonth}).`,
    );
  }
  return usage;
}

export async function assertCanSaveNewSweepstake() {
  const usage = await getUsageSnapshot();
  if (usage.savedSweepstakes >= usage.limits.savedSweepstakes) {
    throw new Error(
      `${usage.limits.name} plan saved sweepstakes limit reached (${usage.savedSweepstakes}/${usage.limits.savedSweepstakes}).`,
    );
  }
  return usage;
}

export async function getSaaSAdminSummary(): Promise<SaaSAdminSummary> {
  const store = await getStore();
  const [organization, membership, subscription, usage, settings] = await Promise.all([
    store.getActiveOrganization(),
    store.getActiveMembership(),
    store.getBillingSubscription(),
    getUsageSnapshot(),
    store.getSettings(),
  ]);
  return {
    organization,
    membership,
    subscription,
    usage,
    plans: Object.values(PLAN_LIMITS),
    stripe: stripeRuntimeSummary(),
    manualApprovalRequired: settings.requireApprovalForEveryEntry,
  };
}

export function buildDefaultOrganization(now = new Date().toISOString()): Organization {
  return {
    id: DEFAULT_ORGANIZATION_ID,
    name: process.env.SWEEPSCOUT_DEFAULT_ORG_NAME ?? "Personal Workspace",
    slug: process.env.SWEEPSCOUT_DEFAULT_ORG_SLUG ?? "personal-workspace",
    planTier: normalizePlanTier(process.env.SWEEPSCOUT_PLAN_TIER ?? "power"),
    createdAt: now,
    updatedAt: now,
  };
}

export function buildDefaultMembership(organizationId = DEFAULT_ORGANIZATION_ID, now = new Date().toISOString()): OrganizationMembership {
  return {
    id: `membership-${organizationId}-owner`,
    organizationId,
    userId: process.env.SWEEPSCOUT_USER_ID ?? DEFAULT_USER_ID,
    email: process.env.SWEEPSCOUT_OWNER_EMAIL ?? "you@example.com",
    role: "owner",
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

export function buildDefaultSubscription(organizationId = DEFAULT_ORGANIZATION_ID, tier: PlanTier = "power", now = new Date().toISOString()): BillingSubscription {
  return {
    id: `subscription-${organizationId}`,
    organizationId,
    tier,
    status: tier === "free" ? "none" : "active",
    stripeCustomerId: process.env.STRIPE_CUSTOMER_ID ?? null,
    stripeSubscriptionId: process.env.STRIPE_SUBSCRIPTION_ID ?? null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    updatedAt: now,
  };
}

function stripeRuntimeSummary() {
  return {
    configured: Boolean(process.env.STRIPE_SECRET_KEY),
    publishableKeyConfigured: Boolean(process.env.STRIPE_PUBLISHABLE_KEY),
    webhookSecretConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    priceIds: {
      free: null,
      pro: process.env.STRIPE_PRICE_PRO ?? null,
      power: process.env.STRIPE_PRICE_POWER ?? null,
    },
  } satisfies SaaSAdminSummary["stripe"];
}

function currentUsagePeriod() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

function featureLabel(feature: string) {
  return feature.replace(/[A-Z]/g, (match) => ` ${match.toLowerCase()}`);
}
