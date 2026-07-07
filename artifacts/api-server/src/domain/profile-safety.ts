const forbiddenVaultFieldPattern =
  /\b(ssn|social security|social_security|social-security|bank|banking|routing|account number|account_number|account-number|credit card|credit_card|card number|card_number|payment|cvv|cvc)\b/i;

export const profileVaultWarning =
  "Never store SSN, banking information, payment cards, or prize-tax processing details in SweepScout. Legitimate sweepstakes should not request SSN or banking information until verified winner processing.";

export function assertNoForbiddenVaultFields(fields: Iterable<string>) {
  for (const field of fields) {
    const normalized = field.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
    if (forbiddenVaultFieldPattern.test(normalized)) {
      throw new Error("SweepScout does not store SSN, banking, payment card, or payment information.");
    }
  }
}

export function assertNoForbiddenVaultObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }
  const record = value as Record<string, unknown>;
  assertNoForbiddenVaultFields(Object.keys(record));
  assertNoForbiddenVaultValues(Object.values(record));
}

export function assertNoForbiddenVaultValues(values: Iterable<unknown>) {
  for (const value of values) {
    if (typeof value === "string") {
      assertNoForbiddenSensitiveText(value);
      continue;
    }
    if (Array.isArray(value)) {
      assertNoForbiddenVaultValues(value);
      continue;
    }
    if (value && typeof value === "object") {
      assertNoForbiddenVaultObject(value);
    }
  }
}

export function assertNoForbiddenSensitiveText(value: string) {
  if (/\b(?!000|666|9\d{2})\d{3}[- ]?(?!00)\d{2}[- ]?(?!0000)\d{4}\b/.test(value)) {
    throw new Error("SweepScout does not store SSN values.");
  }

  for (const match of value.matchAll(/\b(?:\d[ -]?){13,19}\b/g)) {
    const digits = match[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      throw new Error("SweepScout does not store payment card numbers.");
    }
  }
}

function luhnValid(value: string) {
  let sum = 0;
  let double = false;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    let digit = Number(value[index]);
    if (!Number.isInteger(digit)) return false;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum > 0 && sum % 10 === 0;
}
