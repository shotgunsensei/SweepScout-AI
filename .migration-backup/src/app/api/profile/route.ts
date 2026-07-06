import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { jsonError, jsonOk, jsonRateLimitError, readJson } from "@/lib/http";
import { assertNoForbiddenVaultObject } from "@/lib/profile-safety";
import { checkRequestRateLimit } from "@/lib/rate-limit";
import { getStore } from "@/lib/storage/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const profileSchema = z.object({
  email: z.string().email(),
  alternateEmail: z.string().email().or(z.literal("")).optional().default(""),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dob: z.string().min(4),
  state: z.string().min(2),
  country: z.string().min(2),
  phone: z.string().optional().default(""),
  address1: z.string().optional().default(""),
  address2: z.string().optional().default(""),
  city: z.string().optional().default(""),
  postalCode: z.string().optional().default(""),
  categories: z.array(z.string()).default([]),
  maxDailyEntries: z.coerce.number().int().min(1).max(100).default(12),
  avoidPurchaseRequired: z.boolean().default(true),
  allowSocialActions: z.boolean().default(false),
  consentToPrefill: z.boolean().optional(),
  prefillConfirmation: z.boolean().optional().default(false),
}).strict();

export async function PUT(request: Request) {
  try {
    const limit = checkRequestRateLimit(request, "profile", 20, 10 * 60 * 1000);
    if (!limit.allowed) {
      return jsonRateLimitError("Profile update rate limit exceeded. Try again later.", limit.resetAt);
    }
    const rawBody = await readJson(request);
    assertNoForbiddenVaultObject(rawBody);
    const body = profileSchema.parse(rawBody);
    const store = await getStore();
    const current = await store.getUserProfile();
    const wantsPrefill = body.consentToPrefill ?? current.consentToPrefill;
    if (wantsPrefill && !current.consentToPrefill && !body.prefillConfirmation) {
      throw new Error("Confirm the prefill safety warning before enabling form prefill.");
    }
    const profile = await store.saveUserProfile({
      ...current,
      email: body.email,
      alternateEmail: body.alternateEmail,
      firstName: body.firstName,
      lastName: body.lastName,
      dob: body.dob,
      state: body.state,
      country: body.country,
      phone: body.phone,
      address1: body.address1,
      address2: body.address2,
      city: body.city,
      postalCode: body.postalCode,
      consentToPrefill: wantsPrefill,
      preferences: {
        categories: body.categories,
        maxDailyEntries: body.maxDailyEntries,
        avoidPurchaseRequired: body.avoidPurchaseRequired,
        allowSocialActions: body.allowSocialActions,
      },
      updatedAt: new Date().toISOString(),
    });
    await writeAuditLog({
      actorId: null,
      action: "profile.updated",
      entityType: "user_profile",
      entityId: profile.id,
      severity: profile.consentToPrefill ? "warn" : "info",
      message: profile.consentToPrefill ? "Profile vault updated with prefill consent enabled." : "Profile vault updated.",
      metadata: { consentToPrefill: profile.consentToPrefill, categories: profile.preferences.categories },
    });
    return jsonOk(profile);
  } catch (error) {
    return jsonError(error, 400);
  }
}
