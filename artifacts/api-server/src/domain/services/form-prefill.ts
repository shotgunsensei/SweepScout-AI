import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { isBlockedDomain } from "@/lib/discovery/url";
import { getAppConfig, requireOpenAIAccess } from "@/lib/env";
import { detectProtectionSignals } from "@/lib/safety";
import { getStore } from "@/lib/storage/store";
import type { EntryLog, PrefillFieldResult, PrefillProfileField, Sweepstake, UserProfile } from "@/lib/types";

type Page = import("playwright").Page;

type DetectedField = {
  fieldId: string;
  tagName: "INPUT" | "SELECT" | "TEXTAREA";
  type: string;
  autocomplete: string;
  name: string;
  idAttr: string;
  placeholder: string;
  ariaLabel: string;
  label: string;
  required: boolean;
  checked: boolean;
  options: Array<{ value: string; label: string }>;
};

type FieldMapping = {
  profileField: PrefillProfileField | null;
  confidence: number;
  source: "heuristic" | "ai";
  reason: string;
};

const prefillRequestSchema = z
  .object({
    sweepstakeId: z.string().min(1),
    formUrl: z.string().url().optional(),
    userApproved: z.boolean(),
    useAiFallback: z.boolean().optional(),
  })
  .strict();

const aiMappingSchema = z
  .object({
    mappings: z.array(
      z
        .object({
          fieldId: z.string(),
          profileField: z
            .enum([
              "firstName",
              "lastName",
              "email",
              "phone",
              "address1",
              "address2",
              "city",
              "state",
              "postalCode",
              "dateOfBirth",
              "birthMonth",
              "birthDay",
              "birthYear",
            ])
            .nullable(),
          confidence: z.number().min(0).max(1),
          reason: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

export type PrefillFormInput = z.infer<typeof prefillRequestSchema>;

export async function runAssistedFormPrefill(rawInput: PrefillFormInput) {
  const input = prefillRequestSchema.parse(rawInput);
  if (!input.userApproved) {
    throw new Error("Explicit user approval is required before prefill.");
  }

  const store = await getStore();
  const [sweepstake, profile, settings] = await Promise.all([
    store.getSweepstake(input.sweepstakeId),
    store.getUserProfile(),
    store.getSettings(),
  ]);
  if (!sweepstake) {
    throw new Error("Sweepstake not found.");
  }
  if (!settings.formPrefillEnabled) {
    throw new Error("Form prefill is disabled in settings.");
  }
  if (!settings.requireApprovalForEveryEntry) {
    throw new Error("Manual approval is required before every assisted entry.");
  }
  if (!profile.consentToPrefill) {
    throw new Error("Enable profile vault prefill consent before using assisted prefill.");
  }
  assertPrefillAllowed(sweepstake);

  const formUrl = input.formUrl ?? sweepstake.formUrl ?? sweepstake.extractedRules?.formUrl ?? null;
  if (!formUrl) {
    throw new Error("No form URL is available for this sweepstake.");
  }
  assertHttpUrl(formUrl);
  const blockedDomains = await store.listBlockedDomains();
  if (isBlockedDomain(formUrl, blockedDomains.map((domain) => domain.domain))) {
    await writeAuditLog({
      actorId: null,
      action: "prefill.blocked_domain",
      entityType: "sweepstake",
      entityId: sweepstake.id,
      severity: "block",
      message: "Prefill blocked because the form domain is on the owner blocklist.",
      metadata: { formUrl },
    });
    throw new Error("This form domain is blocked by the owner blocklist.");
  }

  const entryId = `entry-${randomUUID()}`;
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: getAppConfig().browserHeadless });
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await context.newPage();

  try {
    await writeAuditLog({
      actorId: null,
      action: "prefill.started",
      entityType: "sweepstake",
      entityId: sweepstake.id,
      severity: "info",
      message: "User-approved assisted prefill started.",
      metadata: { formUrl, useAiFallback: input.useAiFallback !== false },
    });
    await page.goto(formUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);

    const pageText = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
    const pageHtml = await page.content();
    const signals = detectProtectionSignals({ url: page.url(), text: `${pageText}\n${pageHtml}` });
    const blockers = signals
      .filter((signal) => signal.kind === "bot_protection" || signal.kind === "rate_limit")
      .map((signal) => signal.message);
    if (blockers.length) {
      throw new Error(blockers.join(" "));
    }

    const fields = await detectFields(page);
    const profileValues = buildProfileValues(profile);
    const aiMappings = input.useAiFallback === false ? new Map<string, FieldMapping>() : await mapAmbiguousFieldsWithAI(fields);
    const fillResults: PrefillFieldResult[] = [];

    for (const field of fields) {
      const safetyResult = await enforceFieldSafety(page, field);
      if (safetyResult) {
        fillResults.push(safetyResult);
        continue;
      }

      const heuristic = mapFieldHeuristically(field);
      const mapping = heuristic.profileField ? heuristic : aiMappings.get(field.fieldId);
      if (!mapping?.profileField || mapping.confidence < 0.72) {
        fillResults.push({
          fieldId: field.fieldId,
          label: describeField(field),
          profileField: null,
          status: "skipped",
          source: mapping?.source ?? "heuristic",
          reason: mapping?.reason ?? "No confident profile-field mapping.",
        });
        continue;
      }

      const value = profileValues[mapping.profileField];
      if (!value) {
        fillResults.push({
          fieldId: field.fieldId,
          label: describeField(field),
          profileField: mapping.profileField,
          status: "skipped",
          source: mapping.source,
          reason: "Profile value is empty.",
        });
        continue;
      }

      const filled = await fillMappedField(page, field, mapping.profileField, value);
      fillResults.push({
        fieldId: field.fieldId,
        label: describeField(field),
        profileField: mapping.profileField,
        status: filled.ok ? "filled" : "skipped",
        source: mapping.source,
        reason: filled.reason,
      });
    }

    const captchaBlockers = signals.filter((signal) => signal.kind === "captcha").map((signal) => signal.message);
    const screenshotPath = await capturePrefillScreenshot(page, entryId);
    const entry: EntryLog = {
      id: entryId,
      sweepstakeId: sweepstake.id,
      sweepstakeTitle: sweepstake.title,
      status: "prefilled",
      attemptedAt: new Date().toISOString(),
      submittedAt: null,
      confirmationCode: null,
      notes: buildPrefillNotes(fillResults, captchaBlockers),
      formUrl,
      screenshotPath,
      prefillFields: fillResults,
      blockers: captchaBlockers,
      userApproved: false,
      purchaseRequiredAcknowledged: false,
    };

    const saved = await store.saveEntryLog(entry);
    await writeAuditLog({
      actorId: null,
      action: "prefill.completed",
      entityType: "entry_attempt",
      entityId: saved.id,
      severity: captchaBlockers.length ? "warn" : "info",
      message: "Assisted prefill completed without submitting the form.",
      metadata: {
        sweepstakeId: sweepstake.id,
        formUrl,
        filled: fillResults.filter((result) => result.status === "filled").length,
        manualOnly: fillResults.filter((result) => result.status === "manual_only").length,
        blocked: fillResults.filter((result) => result.status === "blocked").length,
        captchaPresent: captchaBlockers.length > 0,
      },
    });
    return {
      entry: saved,
      reviewUrl: `/dashboard/entries/${saved.id}/review`,
      filledCount: fillResults.filter((result) => result.status === "filled").length,
      skippedCount: fillResults.filter((result) => result.status === "skipped").length,
      manualOnlyCount: fillResults.filter((result) => result.status === "manual_only").length,
      safety: [
        "No form was submitted.",
        "No CAPTCHA was solved or bypassed.",
        "Terms and consent checkboxes were left for manual user action.",
      ],
    };
  } catch (error) {
    await writeAuditLog({
      actorId: null,
      action: "prefill.failed",
      entityType: "sweepstake",
      entityId: sweepstake.id,
      severity: "warn",
      message: error instanceof Error ? error.message : "Assisted prefill failed.",
      metadata: { formUrl },
    });
    throw error;
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

function assertPrefillAllowed(sweepstake: Sweepstake) {
  if (sweepstake.status === "expired" || sweepstake.status === "ineligible") {
    throw new Error("Only currently eligible sweepstakes can be prefilled.");
  }
  if (sweepstake.status === "suspicious" || sweepstake.purchaseRequired || sweepstake.noPurchaseMethodFound) {
    throw new Error("Resolve suspicious or purchase-required compliance notes before prefill.");
  }
}

function assertHttpUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP(S) form URLs can be prefilled.");
  }
}

async function detectFields(page: Page): Promise<DetectedField[]> {
  return page.evaluate(() => {
    function text(value: string | null | undefined) {
      return (value ?? "").replace(/\s+/g, " ").trim();
    }

    function associatedLabel(element: Element) {
      const id = element.getAttribute("id");
      const explicit = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : "";
      const wrapped = element.closest("label")?.textContent;
      const container = element.closest("div, li, p, section, fieldset")?.querySelector("label")?.textContent;
      return text(explicit || wrapped || container || "");
    }

    function visible(element: HTMLElement) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }

    return Array.from(document.querySelectorAll("input, select, textarea"))
      .filter((element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement => element instanceof HTMLElement && visible(element))
      .map((element, index) => {
        const fieldId = `field-${index}`;
        element.setAttribute("data-sweepscout-field-id", fieldId);
        const tagName = element.tagName as "INPUT" | "SELECT" | "TEXTAREA";
        const input = element as HTMLInputElement;
        const select = element as HTMLSelectElement;
        return {
          fieldId,
          tagName,
          type: tagName === "INPUT" ? text(input.type || "text").toLowerCase() : tagName.toLowerCase(),
          autocomplete: text(element.getAttribute("autocomplete")).toLowerCase(),
          name: text(element.getAttribute("name")),
          idAttr: text(element.getAttribute("id")),
          placeholder: text(element.getAttribute("placeholder")),
          ariaLabel: text(element.getAttribute("aria-label")),
          label: associatedLabel(element),
          required: Boolean((element as HTMLInputElement).required),
          checked: Boolean(input.checked),
          options:
            tagName === "SELECT"
              ? Array.from(select.options).map((option) => ({ value: text(option.value), label: text(option.label || option.textContent) }))
              : [],
        };
      })
      .filter((field) => !["hidden", "submit", "button", "image", "reset", "file", "password"].includes(field.type));
  });
}

async function enforceFieldSafety(page: Page, field: DetectedField): Promise<PrefillFieldResult | null> {
  if (field.type === "radio") {
    return {
      fieldId: field.fieldId,
      label: describeField(field),
      profileField: null,
      status: "manual_only",
      source: "safety",
      reason: "Radio choices require manual review.",
    };
  }

  if (field.type === "checkbox") {
    if (isTermsOrConsentField(field) && field.checked) {
      await page.locator(fieldSelector(field)).uncheck({ timeout: 2_000 }).catch(() => undefined);
    }
    return {
      fieldId: field.fieldId,
      label: describeField(field),
      profileField: null,
      status: "manual_only",
      source: "safety",
      reason: isTermsOrConsentField(field)
        ? "Terms, rules, and consent checkboxes are left unchecked for the user."
        : "Checkbox requires manual review.",
    };
  }

  if (isSensitiveField(field)) {
    return {
      fieldId: field.fieldId,
      label: describeField(field),
      profileField: null,
      status: "blocked",
      source: "safety",
      reason: "Sensitive financial, SSN, or payment field was not filled.",
    };
  }

  return null;
}

function mapFieldHeuristically(field: DetectedField): FieldMapping {
  const haystack = descriptorText(field);
  const autocomplete = field.autocomplete;

  if (field.type === "email" || autocomplete === "email" || /\be-?mail\b/.test(haystack)) {
    return mapped("email", "heuristic", "Email field matched.");
  }
  if (field.type === "tel" || autocomplete.includes("tel") || /\b(phone|mobile|cell|telephone)\b/.test(haystack)) {
    return mapped("phone", "heuristic", "Phone field matched.");
  }
  if (autocomplete === "given-name" || /\b(first|given|fname)\b/.test(haystack)) {
    return mapped("firstName", "heuristic", "First-name field matched.");
  }
  if (autocomplete === "family-name" || /\b(last|family|surname|lname)\b/.test(haystack)) {
    return mapped("lastName", "heuristic", "Last-name field matched.");
  }
  if (autocomplete === "address-line1" || /\b(address|street|mailing)\b/.test(haystack) && !/\b(2|second|apt|apartment|suite|unit)\b/.test(haystack)) {
    return mapped("address1", "heuristic", "Street address field matched.");
  }
  if (autocomplete === "address-line2" || /\b(address 2|address2|apt|apartment|suite|unit)\b/.test(haystack)) {
    return mapped("address2", "heuristic", "Address line 2 field matched.");
  }
  if (autocomplete === "address-level2" || /\bcity\b/.test(haystack)) {
    return mapped("city", "heuristic", "City field matched.");
  }
  if (autocomplete === "address-level1" || /\b(state|province|region)\b/.test(haystack)) {
    return mapped("state", "heuristic", "State field matched.");
  }
  if (autocomplete === "postal-code" || /\b(zip|postal|postcode)\b/.test(haystack)) {
    return mapped("postalCode", "heuristic", "Postal-code field matched.");
  }
  if (autocomplete === "bday" || field.type === "date" && /\b(birth|dob|date of birth)\b/.test(haystack)) {
    return mapped("dateOfBirth", "heuristic", "Date-of-birth field matched.");
  }
  if (autocomplete === "bday-month" || /\b(birth|dob)\b/.test(haystack) && /\b(month|mm)\b/.test(haystack)) {
    return mapped("birthMonth", "heuristic", "Birth-month field matched.");
  }
  if (autocomplete === "bday-day" || /\b(birth|dob)\b/.test(haystack) && /\b(day|dd)\b/.test(haystack)) {
    return mapped("birthDay", "heuristic", "Birth-day field matched.");
  }
  if (autocomplete === "bday-year" || /\b(birth|dob)\b/.test(haystack) && /\b(year|yyyy)\b/.test(haystack)) {
    return mapped("birthYear", "heuristic", "Birth-year field matched.");
  }

  return { profileField: null, confidence: 0, source: "heuristic", reason: "No heuristic match." };
}

async function mapAmbiguousFieldsWithAI(fields: DetectedField[]) {
  const ambiguous = fields
    .filter((field) => !mapFieldHeuristically(field).profileField)
    .filter((field) => field.type !== "checkbox" && field.type !== "radio" && !isSensitiveField(field))
    .slice(0, 20);

  if (!ambiguous.length || !getAppConfig().openaiConfigured) {
    return new Map<string, FieldMapping>();
  }

  try {
    const access = requireOpenAIAccess();
    const response = await fetch(`${access.baseUrl}/responses`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${access.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: getAppConfig().openaiModel,
        instructions:
          "Map web form field descriptors to profile fields for a sweepstakes prefill assistant. Do not map terms, consent, CAPTCHA, payment, SSN, bank, or submit controls. Return null when unsure.",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(
                  ambiguous.map((field) => ({
                    fieldId: field.fieldId,
                    type: field.type,
                    autocomplete: field.autocomplete,
                    name: field.name,
                    id: field.idAttr,
                    placeholder: field.placeholder,
                    label: field.label,
                    ariaLabel: field.ariaLabel,
                    options: field.options.slice(0, 12),
                  })),
                ),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "form_field_mapping",
            strict: true,
            schema: aiMappingJsonSchema,
          },
        },
      }),
    });
    const json = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }>; error?: { message?: string } };
    if (!response.ok) {
      console.warn("[form-prefill] AI field mapping skipped:", json.error?.message ?? response.status);
      return new Map<string, FieldMapping>();
    }
    const text = json.output_text ?? json.output?.flatMap((item) => item.content ?? []).find((item) => item.text)?.text;
    if (!text) return new Map<string, FieldMapping>();

    const parsed = aiMappingSchema.parse(JSON.parse(text));
    return new Map(
      parsed.mappings
        .filter((mapping) => mapping.confidence >= 0.72)
        .map((mapping) => [
          mapping.fieldId,
          {
            profileField: mapping.profileField,
            confidence: mapping.confidence,
            source: "ai" as const,
            reason: mapping.reason,
          },
        ]),
    );
  } catch (error) {
    console.warn("[form-prefill] AI field mapping skipped:", error instanceof Error ? error.message : "Unknown error");
    return new Map<string, FieldMapping>();
  }
}

async function fillMappedField(page: Page, field: DetectedField, profileField: PrefillProfileField, value: string) {
  const locator = page.locator(fieldSelector(field)).first();
  try {
    if (field.tagName === "SELECT") {
      const selected = await selectProfileOption(locator, field, profileField, value);
      return { ok: selected, reason: selected ? "Field filled from profile." : "No matching select option." };
    }
    await locator.fill(value, { timeout: 3_000 });
    return { ok: true, reason: "Field filled from profile." };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Could not fill field." };
  }
}

async function selectProfileOption(locator: ReturnType<Page["locator"]>, field: DetectedField, profileField: PrefillProfileField, value: string) {
  const candidates = selectCandidates(profileField, value);
  for (const candidate of candidates) {
    await locator.selectOption({ value: candidate }, { timeout: 1_000 }).then(() => true).catch(() => false);
    const selected = await locator.evaluate((element) => (element as HTMLSelectElement).value).catch(() => "");
    if (selected && candidates.map((item) => item.toLowerCase()).includes(String(selected).toLowerCase())) return true;
  }
  for (const candidate of candidates) {
    await locator.selectOption({ label: candidate }, { timeout: 1_000 }).then(() => true).catch(() => false);
    const selectedLabel = await locator
      .evaluate((element) => {
        const select = element as HTMLSelectElement;
        return select.options[select.selectedIndex]?.label ?? "";
      })
      .catch(() => "");
    if (selectedLabel.toLowerCase() === candidate.toLowerCase()) return true;
  }
  const matchingOption = field.options.find((option) =>
    candidates.some((candidate) => option.value.toLowerCase() === candidate.toLowerCase() || option.label.toLowerCase() === candidate.toLowerCase()),
  );
  if (!matchingOption) return false;
  await locator.selectOption(matchingOption.value || { label: matchingOption.label }, { timeout: 1_000 });
  return true;
}

async function capturePrefillScreenshot(page: Page, entryId: string) {
  const filename = `${entryId}.png`;
  const directory = path.join(process.cwd(), "public", "prefill-screenshots");
  await fs.mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, filename), fullPage: true });
  return `/prefill-screenshots/${filename}`;
}

function buildProfileValues(profile: UserProfile): Record<PrefillProfileField, string> {
  const dob = splitDob(profile.dob);
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    phone: profile.phone,
    address1: profile.address1,
    address2: profile.address2,
    city: profile.city,
    state: profile.state,
    postalCode: profile.postalCode,
    dateOfBirth: profile.dob,
    birthMonth: dob.month,
    birthDay: dob.day,
    birthYear: dob.year,
  };
}

function splitDob(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return { year: "", month: "", day: "" };
  return { year: match[1] ?? "", month: match[2] ?? "", day: match[3] ?? "" };
}

function buildPrefillNotes(results: PrefillFieldResult[], blockers: string[]) {
  const filled = results.filter((result) => result.status === "filled").length;
  const manual = results.filter((result) => result.status === "manual_only").length;
  return [
    `Prefilled ${filled} profile-backed field${filled === 1 ? "" : "s"}.`,
    manual ? `${manual} field${manual === 1 ? "" : "s"} left for manual review.` : "",
    ...blockers,
    "Stopped before final submit. Review and submit manually only if you approve.",
  ]
    .filter(Boolean)
    .join(" ");
}

function mapped(profileField: PrefillProfileField, source: FieldMapping["source"], reason: string): FieldMapping {
  return { profileField, confidence: 0.94, source, reason };
}

function descriptorText(field: DetectedField) {
  return [field.autocomplete, field.name, field.idAttr, field.placeholder, field.ariaLabel, field.label]
    .join(" ")
    .toLowerCase()
    .replace(/[_-]/g, " ");
}

function describeField(field: DetectedField) {
  return field.label || field.placeholder || field.ariaLabel || field.name || field.idAttr || field.fieldId;
}

function fieldSelector(field: DetectedField) {
  return `[data-sweepscout-field-id="${field.fieldId}"]`;
}

function isTermsOrConsentField(field: DetectedField) {
  return /\b(terms|official rules|privacy|consent|agree|agreement|eligib|i am|age|subscribe|marketing)\b/.test(descriptorText(field));
}

function isSensitiveField(field: DetectedField) {
  return /\b(ssn|social security|bank|routing|account number|credit card|card number|payment|cvv|cvc|password)\b/.test(descriptorText(field));
}

function selectCandidates(profileField: PrefillProfileField, value: string) {
  if (profileField === "state") {
    const stateName = US_STATE_NAMES[value.toUpperCase()];
    return [value, value.toUpperCase(), value.toLowerCase(), stateName].filter((item): item is string => Boolean(item));
  }
  if (profileField === "birthMonth") {
    const month = Number(value);
    const longName = Number.isFinite(month) ? MONTH_NAMES[month - 1] : undefined;
    const shortName = longName?.slice(0, 3);
    return [value, String(month), longName, shortName].filter((item): item is string => Boolean(item));
  }
  return [value];
}

const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const nullableProfileField = {
  anyOf: [
    {
      type: "string",
      enum: [
        "firstName",
        "lastName",
        "email",
        "phone",
        "address1",
        "address2",
        "city",
        "state",
        "postalCode",
        "dateOfBirth",
        "birthMonth",
        "birthDay",
        "birthYear",
      ],
    },
    { type: "null" },
  ],
};

const aiMappingJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["mappings"],
  properties: {
    mappings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fieldId", "profileField", "confidence", "reason"],
        properties: {
          fieldId: { type: "string" },
          profileField: nullableProfileField,
          confidence: { type: "number", minimum: 0, maximum: 1 },
          reason: { type: "string" },
        },
      },
    },
  },
};
