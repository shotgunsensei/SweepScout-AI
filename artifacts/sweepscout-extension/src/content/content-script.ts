type SsSensitiveKind = "ssn" | "banking" | "payment" | "password" | "unknown";

type SsPageField = {
  id: string;
  label: string;
  name: string;
  type: string;
  autocomplete: string;
  tagName: string;
  suspiciousKind: SsSensitiveKind | null;
};

type SsPageAnalysis = {
  url: string;
  title: string;
  text: string;
  rulesUrl: string | null;
  formUrl: string | null;
  detected: boolean;
  confidence: number;
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  signals: string[];
  suspiciousFields: SsPageField[];
};

type SsApiScore = {
  status: string;
  scamScore: number;
  eligibilityScore: number;
  riskFlags: Array<{ code: string; label: string; severity: string }>;
  complianceNotes: string[];
};

type SsApprovedProfile = {
  firstName: string;
  lastName: string;
  email: string;
  alternateEmail: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  dob: string;
  syncedAt: string;
};

type SsRuntimeResponse<T> = { ok: true; data: T } | { ok: false; error: string };

let ssCurrentAnalysis: SsPageAnalysis = ssAnalyzePage();
let ssApiScore: SsApiScore | null = null;
let ssActiveEmailAlias: string | null = null;
let ssOverlay: HTMLElement | null = null;
let ssBadges: HTMLElement[] = [];

ssInitialize();

chrome.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
  const message = rawMessage as { type?: string };
  ssHandleMessage(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: ssErrorMessage(error) }));
  return true;
});

function ssInitialize() {
  ssRefreshAnalysis();
  ssAttachSensitiveFieldGuards();
  ssAnalyzeWithApi();

  let scheduled = 0;
  const observer = new MutationObserver((mutations) => {
    if (mutations.every((mutation) => ssIsOwnUiMutation(mutation))) return;
    window.clearTimeout(scheduled);
    scheduled = window.setTimeout(() => {
      ssRefreshAnalysis();
      ssAnalyzeWithApi();
    }, 900);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("resize", () => ssPositionBadges());
  window.addEventListener("scroll", () => ssPositionBadges(), { passive: true });
}

async function ssHandleMessage(message: { type?: string }) {
  if (message.type === "SWEEPSCOUT_REQUEST_PAGE_STATE") {
    ssRefreshAnalysis();
    return { analysis: ssCurrentAnalysis, apiScore: ssApiScore };
  }
  if (message.type === "SWEEPSCOUT_SAVE_FROM_POPUP") {
    return ssSavePage();
  }
  if (message.type === "SWEEPSCOUT_PREFILL_FROM_POPUP") {
    return ssPrefillFromApprovedProfile();
  }
  throw new Error("Unknown SweepScout content message.");
}

function ssRefreshAnalysis() {
  ssCurrentAnalysis = ssAnalyzePage();
  ssHighlightSensitiveFields(ssCurrentAnalysis.suspiciousFields);
  ssMarkSubmitControls();
  ssRenderOverlay();
}

function ssAnalyzePage(): SsPageAnalysis {
  const text = ssVisibleText().slice(0, 35_000);
  const fields = ssDetectFields();
  const suspiciousFields = fields.filter((field) => field.suspiciousKind);
  const signals = ssDetectSignals(text);
  const rulesUrl = ssFindOfficialRulesUrl();
  const formUrl = ssFindFormUrl();
  if (rulesUrl) signals.push("Official rules link");
  if (formUrl) signals.push("Entry form");
  if (/\bno\s+purchase\s+necessary\b/i.test(text)) signals.push("No purchase necessary");
  if (/\bdaily|per day|weekly|monthly|one entry\b/i.test(text)) signals.push("Entry frequency language");
  if (/\b(captcha|recaptcha|hcaptcha|cf-turnstile)\b/i.test(text)) signals.push("CAPTCHA likely");

  const detected = ssIsSweepstakesPage(text, signals);
  const riskScore = ssRiskScore(text, suspiciousFields, rulesUrl);
  return {
    url: location.href,
    title: document.title || location.hostname,
    text,
    rulesUrl,
    formUrl,
    detected,
    confidence: ssConfidence(signals, detected),
    riskScore,
    riskLevel: riskScore >= 70 ? "high" : riskScore >= 38 ? "medium" : "low",
    signals: [...new Set(signals)].slice(0, 14),
    suspiciousFields,
  };
}

function ssDetectSignals(text: string) {
  const haystack = `${location.href}\n${document.title}\n${text}`;
  const signals: string[] = [];
  if (/\bsweepstakes?\b/i.test(haystack)) signals.push("Sweepstakes");
  if (/\bgiveaway\b/i.test(haystack)) signals.push("Giveaway");
  if (/\bcontest\b/i.test(haystack)) signals.push("Contest");
  if (/\bofficial\s+rules\b/i.test(haystack)) signals.push("Official rules");
  if (/\benter\s+to\s+win\b/i.test(haystack)) signals.push("Enter to win");
  if (/\binstant\s+win\b/i.test(haystack)) signals.push("Instant win");
  return signals;
}

function ssIsOwnUiMutation(mutation: MutationRecord) {
  const target = mutation.target;
  if (target instanceof Element && (target.closest("#sweepscout-overlay") || target.closest(".sweepscout-field-badge"))) {
    return true;
  }
  return Array.from(mutation.addedNodes).every(
    (node) =>
      node instanceof Element &&
      (node.id === "sweepscout-overlay" ||
        node.classList.contains("sweepscout-field-badge") ||
        Boolean(node.closest("#sweepscout-overlay"))),
  );
}

function ssIsSweepstakesPage(text: string, signals: string[]) {
  if (signals.length >= 2) return true;
  return /\b(no purchase necessary|official rules|enter to win|sweepstakes|instant win game)\b/i.test(
    `${location.href}\n${document.title}\n${text.slice(0, 6000)}`,
  );
}

function ssConfidence(signals: string[], detected: boolean) {
  if (!detected) return 0;
  return Math.min(0.96, 0.34 + signals.length * 0.12);
}

function ssRiskScore(text: string, suspiciousFields: SsPageField[], rulesUrl: string | null) {
  let score = 8;
  if (!rulesUrl && !/\bofficial\s+rules\b/i.test(text)) score += 16;
  if (/\bpurchase required\b/i.test(text) && !/\bno purchase required\b/i.test(text)) score += 32;
  if (/\b(payment|credit card|processing fee|shipping fee|checkout)\b/i.test(text)) score += 30;
  if (/\b(ssn|social security|routing number|bank account)\b/i.test(text)) score += 36;
  for (const field of suspiciousFields) {
    if (field.suspiciousKind === "ssn") score += 34;
    else if (field.suspiciousKind === "banking" || field.suspiciousKind === "payment") score += 30;
    else score += 12;
  }
  return Math.max(0, Math.min(100, score));
}

async function ssAnalyzeWithApi() {
  if (!ssCurrentAnalysis.detected) return;
  try {
    const result = await ssRuntime<{ score: SsApiScore }>("SWEEPSCOUT_ANALYZE_PAGE", { analysis: ssApiPayload() });
    ssApiScore = result.score;
    ssRenderOverlay();
  } catch {
    ssApiScore = null;
    ssRenderOverlay();
  }
}

async function ssSavePage() {
  ssRefreshAnalysis();
  const result = await ssRuntime<{
    created: boolean;
    message: string;
    sweepstake: { title: string; emailAlias: string | null };
    score: SsApiScore;
  }>("SWEEPSCOUT_SAVE_PAGE", { analysis: ssApiPayload() });
  ssApiScore = result.score;
  ssActiveEmailAlias = result.sweepstake.emailAlias;
  ssSetOverlayMessage(result.message);
  ssRenderOverlay();
  return { message: result.message };
}

async function ssPrefillFromApprovedProfile() {
  const profile = await ssRuntime<SsApprovedProfile | null>("SWEEPSCOUT_GET_PROFILE");
  if (!profile) {
    throw new Error("Sync an approved SweepScout profile from the extension popup before prefilling.");
  }
  const results = ssFillProfileFields(profile);
  const blocked = ssCurrentAnalysis.suspiciousFields.length;
  ssSetOverlayMessage(
    `Prefilled ${results.filled} field${results.filled === 1 ? "" : "s"}. ${blocked ? `${blocked} sensitive field warning${blocked === 1 ? "" : "s"} left untouched. ` : ""}Review and submit manually only.`,
  );
  ssRenderOverlay();
  return { message: `Prefilled ${results.filled} field${results.filled === 1 ? "" : "s"}. Manual submit only.` };
}

function ssFillProfileFields(profile: SsApprovedProfile) {
  const dob = ssSplitDob(profile.dob);
  const values: Record<string, string> = {
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: ssActiveEmailAlias || profile.email,
    phone: profile.phone,
    address1: profile.address1,
    address2: profile.address2,
    city: profile.city,
    state: profile.state,
    postalCode: profile.postalCode,
    country: profile.country,
    dateOfBirth: profile.dob,
    birthMonth: dob.month,
    birthDay: dob.day,
    birthYear: dob.year,
  };
  let filled = 0;
  let skipped = 0;
  for (const element of ssFormElements()) {
    const field = ssFieldFromElement(element);
    if (!field || field.suspiciousKind || field.type === "checkbox" || field.type === "radio") {
      skipped += 1;
      continue;
    }
    const key = ssMapFieldToProfileKey(field);
    if (!key || !values[key]) {
      skipped += 1;
      continue;
    }
    if (ssFillElement(element, values[key], key)) {
      element.classList.add("sweepscout-prefilled-field");
      filled += 1;
    } else {
      skipped += 1;
    }
  }
  return { filled, skipped };
}

function ssFillElement(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string, key: string) {
  if (element instanceof HTMLSelectElement) {
    return ssSelectOption(element, value, key);
  }
  element.focus();
  element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function ssSelectOption(element: HTMLSelectElement, value: string, key: string) {
  const candidates = ssSelectCandidates(value, key).map((candidate) => candidate.toLowerCase());
  const option = Array.from(element.options).find((item) => {
    const optionValue = item.value.toLowerCase();
    const label = item.label.toLowerCase();
    return candidates.includes(optionValue) || candidates.includes(label);
  });
  if (!option) return false;
  element.value = option.value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function ssMapFieldToProfileKey(field: SsPageField) {
  const text = ssDescriptor(field);
  if (field.type === "email" || field.autocomplete === "email" || /\be-?mail\b/.test(text)) return "email";
  if (field.type === "tel" || field.autocomplete.includes("tel") || /\b(phone|mobile|cell|telephone)\b/.test(text)) return "phone";
  if (field.autocomplete === "given-name" || /\b(first|given|fname)\b/.test(text)) return "firstName";
  if (field.autocomplete === "family-name" || /\b(last|family|surname|lname)\b/.test(text)) return "lastName";
  if (field.autocomplete === "address-line1" || (/\b(address|street|mailing)\b/.test(text) && !/\b(2|second|apt|apartment|suite|unit)\b/.test(text))) return "address1";
  if (field.autocomplete === "address-line2" || /\b(address 2|address2|apt|apartment|suite|unit)\b/.test(text)) return "address2";
  if (field.autocomplete === "address-level2" || /\bcity\b/.test(text)) return "city";
  if (field.autocomplete === "address-level1" || /\b(state|province|region)\b/.test(text)) return "state";
  if (field.autocomplete === "postal-code" || /\b(zip|postal|postcode)\b/.test(text)) return "postalCode";
  if (field.autocomplete === "country" || /\bcountry\b/.test(text)) return "country";
  if (field.autocomplete === "bday" || (field.type === "date" && /\b(birth|dob|date of birth)\b/.test(text))) return "dateOfBirth";
  if (field.autocomplete === "bday-month" || (/\b(birth|dob)\b/.test(text) && /\b(month|mm)\b/.test(text))) return "birthMonth";
  if (field.autocomplete === "bday-day" || (/\b(birth|dob)\b/.test(text) && /\b(day|dd)\b/.test(text))) return "birthDay";
  if (field.autocomplete === "bday-year" || (/\b(birth|dob)\b/.test(text) && /\b(year|yyyy)\b/.test(text))) return "birthYear";
  return null;
}

function ssRenderOverlay() {
  if (!ssCurrentAnalysis.detected && !ssCurrentAnalysis.suspiciousFields.length) {
    ssOverlay?.remove();
    ssOverlay = null;
    return;
  }

  if (!ssOverlay) {
    ssOverlay = document.createElement("aside");
    ssOverlay.id = "sweepscout-overlay";
    ssOverlay.setAttribute("aria-live", "polite");
    document.documentElement.appendChild(ssOverlay);
  }

  const riskTone = ssApiScore
    ? ssApiScore.scamScore >= 60
      ? "danger"
      : ssApiScore.scamScore >= 35
        ? "warn"
        : "ok"
    : ssCurrentAnalysis.riskLevel === "high"
      ? "danger"
      : ssCurrentAnalysis.riskLevel === "medium"
        ? "warn"
        : "ok";
  const scoreText = ssApiScore
    ? `${ssTitleCase(ssApiScore.status)} | Risk ${ssApiScore.scamScore}/100 | Eligibility ${ssApiScore.eligibilityScore}/100`
    : `${Math.round(ssCurrentAnalysis.confidence * 100)}% page match | Risk ${ssCurrentAnalysis.riskScore}/100`;

  ssOverlay.innerHTML = `
    <div class="sweepscout-head">
      <p class="sweepscout-title">SweepScout</p>
      <button class="sweepscout-icon-button" type="button" data-ss-action="minimize" aria-label="Minimize SweepScout">-</button>
    </div>
    <div class="sweepscout-body">
      <div class="sweepscout-row">
        <span class="sweepscout-chip ${ssCurrentAnalysis.detected ? "ok" : "warn"}">${ssCurrentAnalysis.detected ? "Sweepstakes detected" : "Weak match"}</span>
        <span class="sweepscout-chip ${riskTone}">${scoreText}</span>
      </div>
      <p class="sweepscout-note" data-ss-message>${ssOverlayMessage()}</p>
      <div class="sweepscout-row">
        ${ssCurrentAnalysis.signals.slice(0, 6).map((signal) => `<span class="sweepscout-chip">${ssEscape(signal)}</span>`).join("")}
        ${ssCurrentAnalysis.suspiciousFields.length ? `<span class="sweepscout-chip danger">${ssCurrentAnalysis.suspiciousFields.length} sensitive field${ssCurrentAnalysis.suspiciousFields.length === 1 ? "" : "s"}</span>` : ""}
      </div>
      <div class="sweepscout-actions">
        <button class="sweepscout-button primary" type="button" data-ss-action="save">Save to SweepScout</button>
        <button class="sweepscout-button" type="button" data-ss-action="prefill">Prefill Profile</button>
      </div>
      <p class="sweepscout-note">Manual submit only. SSN, banking, payment, terms, consent, and CAPTCHA fields stay manual.</p>
    </div>
  `;

  ssOverlay.querySelector('[data-ss-action="minimize"]')?.addEventListener("click", () => {
    if (!ssOverlay) return;
    ssOverlay.dataset["minimized"] = ssOverlay.dataset["minimized"] === "true" ? "false" : "true";
  });
  ssOverlay.querySelector('[data-ss-action="save"]')?.addEventListener("click", () => {
    ssSavePage().catch((error) => ssSetOverlayMessage(ssErrorMessage(error)));
  });
  ssOverlay.querySelector('[data-ss-action="prefill"]')?.addEventListener("click", () => {
    ssPrefillFromApprovedProfile().catch((error) => ssSetOverlayMessage(ssErrorMessage(error)));
  });
}

function ssOverlayMessage() {
  const existing = ssOverlay?.querySelector("[data-ss-message]")?.textContent;
  if (existing) return ssEscape(existing);
  if (ssApiScore?.complianceNotes?.[0]) return ssEscape(ssApiScore.complianceNotes[0]);
  if (ssCurrentAnalysis.suspiciousFields.length) return "Sensitive fields are highlighted. Review before entering anything.";
  return "Review eligibility and official rules before entry.";
}

function ssSetOverlayMessage(message: string) {
  if (!ssOverlay) return;
  const node = ssOverlay.querySelector("[data-ss-message]");
  if (node) node.textContent = message;
}

function ssHighlightSensitiveFields(fields: SsPageField[]) {
  for (const badge of ssBadges) badge.remove();
  ssBadges = [];
  for (const element of ssFormElements()) {
    element.classList.remove("sweepscout-sensitive-field");
    const field = ssFieldFromElement(element);
    if (!field?.suspiciousKind) continue;
    element.classList.add("sweepscout-sensitive-field");
    element.setAttribute("data-sweepscout-sensitive-kind", field.suspiciousKind);
    element.setAttribute("title", ssSensitiveWarning(field.suspiciousKind));
    const badge = document.createElement("div");
    badge.className = "sweepscout-field-badge";
    badge.textContent = ssSensitiveWarning(field.suspiciousKind);
    document.documentElement.appendChild(badge);
    ssBadges.push(badge);
  }
  ssPositionBadges();
  if (fields.length) ssRenderOverlay();
}

function ssPositionBadges() {
  const sensitiveElements = ssFormElements().filter((element) => element.classList.contains("sweepscout-sensitive-field"));
  sensitiveElements.forEach((element, index) => {
    const badge = ssBadges[index];
    if (!badge) return;
    const rect = element.getBoundingClientRect();
    badge.style.left = `${Math.max(8, rect.left + window.scrollX)}px`;
    badge.style.top = `${Math.max(8, rect.top + window.scrollY - 28)}px`;
  });
}

function ssMarkSubmitControls() {
  const submitControls = Array.from(
    document.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
      'button[type="submit"], input[type="submit"], form button:not([type])',
    ),
  );
  for (const control of submitControls) {
    control.classList.add("sweepscout-submit-field");
    control.setAttribute("title", "SweepScout does not click submit. Review and submit manually only if you approve.");
  }
}

function ssAttachSensitiveFieldGuards() {
  document.addEventListener("focusin", (event) => {
    const element = ssElementFromEvent(event);
    if (!element) return;
    const kind = ssFieldFromElement(element)?.suspiciousKind;
    if (!kind) return;
    ssSetOverlayMessage(ssSensitiveWarning(kind));
  });

  document.addEventListener(
    "beforeinput",
    (event) => {
      const element = ssElementFromEvent(event);
      if (!element) return;
      const kind = ssFieldFromElement(element)?.suspiciousKind;
      if (!kind || element.dataset["sweepscoutSensitiveAcknowledged"] === "true") return;
      const confirmed = window.confirm(`${ssSensitiveWarning(kind)} Continue typing manually?`);
      if (!confirmed) {
        event.preventDefault();
        element.blur();
        ssSetOverlayMessage("Sensitive-field entry was cancelled.");
        return;
      }
      element.dataset["sweepscoutSensitiveAcknowledged"] = "true";
    },
    { capture: true },
  );
}

function ssDetectFields() {
  return ssFormElements()
    .map((element, index) => {
      if (!element.dataset["sweepscoutFieldId"]) {
        element.dataset["sweepscoutFieldId"] = `ss-field-${index}-${Math.random().toString(16).slice(2)}`;
      }
      return ssFieldFromElement(element);
    })
    .filter((field): field is SsPageField => Boolean(field));
}

function ssFieldFromElement(element: Element): SsPageField | null {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) return null;
  const type = element instanceof HTMLInputElement ? (element.type || "text").toLowerCase() : element.tagName.toLowerCase();
  if (["hidden", "submit", "button", "image", "reset", "file"].includes(type)) return null;
  const field: SsPageField = {
    id: element.dataset["sweepscoutFieldId"] || "",
    label: ssAssociatedLabel(element),
    name: element.getAttribute("name") || "",
    type,
    autocomplete: (element.getAttribute("autocomplete") || "").toLowerCase(),
    tagName: element.tagName,
    suspiciousKind: null,
  };
  field.suspiciousKind = ssSensitiveKind(field);
  return field;
}

function ssSensitiveKind(field: SsPageField): SsSensitiveKind | null {
  const text = ssDescriptor(field);
  if (/\b(ssn|social security|tax id|tin)\b/.test(text)) return "ssn";
  if (/\b(bank|routing|account number|iban|swift|wire|ach)\b/.test(text)) return "banking";
  if (/\b(credit card|card number|payment|billing|cvv|cvc|expiration|exp date|checkout|processing fee)\b/.test(text)) return "payment";
  if (field.type === "password" || /\bpassword\b/.test(text)) return "password";
  return null;
}

function ssSensitiveWarning(kind: SsSensitiveKind) {
  const labels: Record<SsSensitiveKind, string> = {
    ssn: "SSN field detected. Do not provide SSN before verified winner claim review.",
    banking: "Banking field detected. SweepScout will not fill bank or routing details.",
    payment: "Payment field detected. Review official rules and no-purchase method before continuing.",
    password: "Password field detected. SweepScout does not fill account credentials.",
    unknown: "Sensitive field detected. Review manually before entering data.",
  };
  return labels[kind];
}

function ssFormElements() {
  return Array.from(document.querySelectorAll("input, select, textarea")).filter(
    (element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) &&
      ssIsVisible(element),
  );
}

function ssIsVisible(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}

function ssAssociatedLabel(element: Element) {
  const id = element.getAttribute("id");
  const explicit = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : "";
  const wrapped = element.closest("label")?.textContent;
  const container = element.closest("div, li, p, section, fieldset")?.querySelector("label")?.textContent;
  return ssCleanText(explicit || wrapped || container || element.getAttribute("aria-label") || element.getAttribute("placeholder") || "");
}

function ssDescriptor(field: SsPageField) {
  return [field.autocomplete, field.name, field.label, field.type]
    .join(" ")
    .toLowerCase()
    .replace(/[_-]/g, " ");
}

function ssVisibleText() {
  const clone = document.body?.cloneNode(true);
  if (!(clone instanceof HTMLElement)) return "";
  clone.querySelectorAll("script, style, noscript, svg, template").forEach((element) => element.remove());
  return ssCleanText(clone.innerText || clone.textContent || "");
}

function ssCleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function ssFindOfficialRulesUrl() {
  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
  for (const anchor of anchors) {
    const haystack = `${anchor.textContent ?? ""} ${anchor.href}`.toLowerCase();
    if (!/\bofficial\s+rules\b|\brules\s+and\s+regulations\b|\bterms\s+and\s+conditions\b/.test(haystack)) continue;
    const url = ssHttpUrl(anchor.href);
    if (url) return url;
  }
  return location.href.toLowerCase().includes("rules") ? location.href : null;
}

function ssFindFormUrl() {
  const form = document.querySelector<HTMLFormElement>("form[action]");
  if (form?.action) {
    const url = ssHttpUrl(form.action);
    if (url) return url;
  }
  return document.querySelector("form") ? location.href : null;
}

function ssHttpUrl(value: string) {
  try {
    const url = new URL(value, location.href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function ssApiPayload() {
  return {
    url: ssCurrentAnalysis.url,
    title: ssCurrentAnalysis.title,
    text: ssCurrentAnalysis.text,
    rulesUrl: ssCurrentAnalysis.rulesUrl,
    formUrl: ssCurrentAnalysis.formUrl,
    detected: ssCurrentAnalysis.detected,
    signals: ssCurrentAnalysis.signals,
    suspiciousFields: ssCurrentAnalysis.suspiciousFields.map((field) => ({
      id: field.id,
      label: field.label,
      name: field.name,
      type: field.type,
      autocomplete: field.autocomplete,
      suspiciousKind: field.suspiciousKind,
    })),
  };
}

function ssRuntime<T>(type: string, payload: Record<string, unknown> = {}) {
  return new Promise<T>((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (rawResponse) => {
      const lastError = chrome.runtime.lastError;
      if (lastError?.message) {
        reject(new Error(lastError.message));
        return;
      }
      const response = rawResponse as SsRuntimeResponse<T> | undefined;
      if (!response) {
        reject(new Error("No response from SweepScout extension background worker."));
        return;
      }
      if (!response.ok) {
        reject(new Error(response.error));
        return;
      }
      resolve(response.data);
    });
  });
}

function ssElementFromEvent(event: Event) {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return target;
  return null;
}

function ssSplitDob(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return { year: match?.[1] ?? "", month: match?.[2] ?? "", day: match?.[3] ?? "" };
}

function ssSelectCandidates(value: string, key: string) {
  if (key === "state") {
    const stateName = SS_STATE_NAMES[value.toUpperCase()];
    return [value, value.toUpperCase(), value.toLowerCase(), stateName].filter((item): item is string => Boolean(item));
  }
  if (key === "birthMonth") {
    const month = Number(value);
    const longName = Number.isFinite(month) ? SS_MONTH_NAMES[month - 1] : undefined;
    return [value, String(month), longName, longName?.slice(0, 3)].filter((item): item is string => Boolean(item));
  }
  return [value];
}

function ssEscape(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char] ?? char;
  });
}

function ssTitleCase(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ssErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "SweepScout action failed.";
}

const SS_STATE_NAMES: Record<string, string> = {
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
  DC: "District of Columbia",
};

const SS_MONTH_NAMES = [
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
