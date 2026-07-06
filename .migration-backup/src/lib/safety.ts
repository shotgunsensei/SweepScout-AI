export const automationGuardrails = [
  "Do not bypass CAPTCHAs, bot protection, waiting rooms, paywalls, purchase requirements, or rate limits.",
  "Do not submit an entry without explicit user approval recorded in the app.",
  "Do not make purchases, create accounts, follow social accounts, or accept legal terms on behalf of the user.",
  "Do not retry aggressively after 403, 429, CAPTCHA, or bot-protection responses.",
];

export type ProtectionSignal = {
  kind: "captcha" | "bot_protection" | "rate_limit" | "purchase_required";
  message: string;
};

export function detectProtectionSignals(input: { status?: number; url?: string; text?: string }) {
  const text = `${input.url ?? ""}\n${input.text ?? ""}`.toLowerCase();
  const signals: ProtectionSignal[] = [];

  if (input.status === 429 || text.includes("rate limit") || text.includes("too many requests")) {
    signals.push({ kind: "rate_limit", message: "Rate limiting detected; automation stopped." });
  }

  if (text.includes("captcha") || text.includes("recaptcha") || text.includes("hcaptcha")) {
    signals.push({ kind: "captcha", message: "CAPTCHA detected; manual user action is required." });
  }

  if (
    text.includes("cloudflare") ||
    text.includes("bot protection") ||
    text.includes("are you human") ||
    text.includes("verify you are human")
  ) {
    signals.push({ kind: "bot_protection", message: "Bot protection detected; automation stopped." });
  }

  if (text.includes("purchase required") || text.includes("with purchase") || text.includes("buy now")) {
    signals.push({ kind: "purchase_required", message: "Purchase language detected; user review required." });
  }

  return signals;
}

export function assertEntryApproval(input: {
  userApproved: boolean;
  reviewConfirmed: boolean;
  purchaseRequired: boolean;
  noPurchaseMethodFound: boolean;
}) {
  if (!input.userApproved) {
    throw new Error("Explicit user approval is required before recording or assisting with an entry.");
  }

  if (!input.reviewConfirmed) {
    throw new Error("Confirm that you reviewed the official rules, eligibility, terms, and final form before recording the entry.");
  }

  if (input.purchaseRequired || input.noPurchaseMethodFound) {
    throw new Error("Purchase-required or no-purchase-method-missing flows cannot be recorded as submitted.");
  }
}
