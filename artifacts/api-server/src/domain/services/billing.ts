import { createHmac, timingSafeEqual } from "node:crypto";
import { writeAuditLog } from "@/lib/audit";
import { AppConfigError } from "@/lib/env";
import { getActiveTenant, normalizePlanTier } from "@/lib/services/tenancy";
import { getStore } from "@/lib/storage/store";
import type { BillingSubscription, PlanTier, SubscriptionStatus } from "@/lib/types";

type CheckoutInput = {
  tier: PlanTier;
  origin: string;
};

export async function createStripeCheckoutSession(input: CheckoutInput) {
  const tier = input.tier === "power" ? "power" : input.tier === "pro" ? "pro" : null;
  if (!tier) {
    throw new AppConfigError("Free plan does not require Stripe checkout.");
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new AppConfigError("Stripe is not configured. Set STRIPE_SECRET_KEY before creating checkout sessions.");
  }

  const priceId = tier === "pro" ? process.env.STRIPE_PRICE_PRO : process.env.STRIPE_PRICE_POWER;
  if (!priceId) {
    throw new AppConfigError(`Stripe price ID is missing for the ${tier} plan.`);
  }

  const tenant = await getActiveTenant();
  const origin = normalizeOrigin(input.origin);
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("success_url", `${origin}/dashboard/admin?billing=success`);
  body.set("cancel_url", `${origin}/dashboard/admin?billing=cancelled`);
  body.set("line_items[0][price]", priceId);
  body.set("line_items[0][quantity]", "1");
  body.set("client_reference_id", tenant.organization.id);
  body.set("customer_email", tenant.membership.email);
  body.set("metadata[organization_id]", tenant.organization.id);
  body.set("metadata[plan_tier]", tier);
  body.set("subscription_data[metadata][organization_id]", tenant.organization.id);
  body.set("subscription_data[metadata][plan_tier]", tier);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = (await response.json().catch(() => null)) as { id?: string; url?: string; error?: { message?: string } } | null;
  if (!response.ok || !payload?.url) {
    throw new AppConfigError(payload?.error?.message ?? `Stripe checkout failed with HTTP ${response.status}.`);
  }

  return {
    tier,
    checkoutUrl: payload.url,
    sessionId: payload.id ?? null,
    organizationId: tenant.organization.id,
  };
}

export async function handleStripeWebhook(input: { rawBody: Buffer; signature: string | undefined; event: unknown }) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new AppConfigError("Stripe webhook secret is not configured. Set STRIPE_WEBHOOK_SECRET before accepting billing webhooks.");
  }
  if (!input.signature) {
    throw new AppConfigError("Stripe webhook signature is missing.");
  }
  verifyStripeSignature(input.rawBody, input.signature, secret);

  const event = asRecord(input.event);
  const type = stringFrom(event.type);
  const object = asRecord(asRecord(event.data).object);
  if (!type || !object) {
    throw new AppConfigError("Stripe webhook payload is malformed.");
  }

  if (type === "checkout.session.completed") {
    return syncCheckoutSession(object);
  }
  if (type === "customer.subscription.created" || type === "customer.subscription.updated" || type === "customer.subscription.deleted") {
    return syncStripeSubscription(object, type === "customer.subscription.deleted" ? "canceled" : undefined);
  }

  return { ignored: true, type };
}

async function syncCheckoutSession(session: Record<string, unknown>) {
  const store = await getStore();
  const metadata = asRecord(session.metadata);
  const organizationId = stringFrom(metadata.organization_id) ?? stringFrom(session.client_reference_id);
  if (!organizationId) {
    throw new AppConfigError("Stripe checkout session is missing organization metadata.");
  }
  const current = await store.getBillingSubscription(organizationId);
  const tier = normalizePlanTier(metadata.plan_tier ?? current.tier);
  const subscription = await store.saveBillingSubscription({
    ...current,
    organizationId,
    tier,
    status: "active",
    stripeCustomerId: stringFrom(session.customer) ?? current.stripeCustomerId,
    stripeSubscriptionId: stringFrom(session.subscription) ?? current.stripeSubscriptionId,
    updatedAt: new Date().toISOString(),
  });
  await updateOrganizationTier(organizationId, tier);
  await auditBillingSync(subscription, "stripe.checkout_completed");
  return { ignored: false, type: "checkout.session.completed", subscription };
}

async function syncStripeSubscription(subscriptionObject: Record<string, unknown>, statusOverride?: SubscriptionStatus) {
  const store = await getStore();
  const metadata = asRecord(subscriptionObject.metadata);
  const organizationId = stringFrom(metadata.organization_id);
  if (!organizationId) {
    throw new AppConfigError("Stripe subscription event is missing organization metadata.");
  }
  const current = await store.getBillingSubscription(organizationId);
  const tier = normalizePlanTier(metadata.plan_tier ?? current.tier);
  const subscription = await store.saveBillingSubscription({
    ...current,
    organizationId,
    tier,
    status: statusOverride ?? stripeStatus(subscriptionObject.status),
    stripeCustomerId: stringFrom(subscriptionObject.customer) ?? current.stripeCustomerId,
    stripeSubscriptionId: stringFrom(subscriptionObject.id) ?? current.stripeSubscriptionId,
    currentPeriodEnd: unixSecondsToIso(subscriptionObject.current_period_end) ?? current.currentPeriodEnd,
    cancelAtPeriodEnd: Boolean(subscriptionObject.cancel_at_period_end),
    updatedAt: new Date().toISOString(),
  });
  await updateOrganizationTier(organizationId, subscription.status === "canceled" ? "free" : tier);
  await auditBillingSync(subscription, "stripe.subscription_synced");
  return { ignored: false, type: "subscription", subscription };
}

async function updateOrganizationTier(organizationId: string, tier: PlanTier) {
  const store = await getStore();
  const organization = await store.getActiveOrganization();
  if (organization.id !== organizationId) return;
  await store.saveOrganization({ ...organization, planTier: tier, updatedAt: new Date().toISOString() });
}

async function auditBillingSync(subscription: BillingSubscription, action: string) {
  await writeAuditLog({
    organizationId: subscription.organizationId,
    actorId: null,
    action,
    entityType: "billing_subscription",
    entityId: subscription.id,
    severity: subscription.status === "past_due" || subscription.status === "canceled" ? "warn" : "info",
    message: `Billing subscription synced as ${subscription.status} on ${subscription.tier}.`,
    metadata: {
      tier: subscription.tier,
      status: subscription.status,
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    },
  });
}

function normalizeOrigin(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("bad protocol");
    }
    return url.origin;
  } catch {
    return "http://localhost:5173";
  }
}

function verifyStripeSignature(rawBody: Buffer, signatureHeader: string, secret: string) {
  const parts = Object.fromEntries(
    signatureHeader
      .split(",")
      .map((part) => part.split("="))
      .filter((part): part is [string, string] => part.length === 2),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) {
    throw new AppConfigError("Stripe webhook signature is malformed.");
  }
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex");
  const received = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (received.length !== expectedBuffer.length || !timingSafeEqual(received, expectedBuffer)) {
    throw new AppConfigError("Stripe webhook signature verification failed.");
  }
}

function stripeStatus(value: unknown): SubscriptionStatus {
  const status = stringFrom(value);
  if (status === "trialing" || status === "active" || status === "past_due" || status === "canceled" || status === "incomplete") {
    return status;
  }
  return "none";
}

function unixSecondsToIso(value: unknown) {
  const seconds = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringFrom(value: unknown) {
  return typeof value === "string" && value.trim().length ? value : null;
}
