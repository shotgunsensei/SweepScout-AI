import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function walk(directory) {
  const absolute = path.join(root, directory);
  return readdirSync(absolute).flatMap((entry) => {
    const full = path.join(absolute, entry);
    const relative = path.relative(root, full).replace(/\\/g, "/");
    if (statSync(full).isDirectory()) return walk(relative);
    return relative;
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const srcFiles = walk("src").filter((file) => /\.(ts|tsx)$/.test(file));
const sourceText = srcFiles.map((file) => `\n// ${file}\n${read(file)}`).join("\n");
const formPrefill = read("src/lib/services/form-prefill.ts");
const safety = read("src/lib/safety.ts");
const entriesRoute = read("src/app/api/entries/route.ts");
const auditMigration = read("supabase/migrations/20260705020000_audit_log.sql");
const profileMigration = read("supabase/migrations/20260705000000_profile_vault_security.sql");

assert(!/\.(click|dblclick)\s*\(/.test(formPrefill), "Form prefill must not click controls or submit buttons.");
assert(!/\.press\s*\(\s*["'`]Enter["'`]/.test(formPrefill), "Form prefill must not press Enter to submit.");
assert(!/\bsubmit\s*\(/i.test(formPrefill), "Form prefill must not call submit().");
assert(/Terms, rules, and consent checkboxes are left unchecked/.test(formPrefill), "Terms checkboxes must remain manual-only.");
assert(/captcha/i.test(formPrefill) && /No CAPTCHA was solved or bypassed/.test(formPrefill), "CAPTCHA handling must be manual-only.");

assert(!/\bproxy\s*:/.test(sourceText), "Proxy rotation/configuration must not be present.");
assert(!/AutomationControlled|navigator\.webdriver|puppeteer-extra|stealth/i.test(sourceText), "Hidden automation or stealth patterns must not be present.");
assert(/Purchase-required or no-purchase-method-missing flows cannot be recorded as submitted/.test(safety), "Purchase-required submissions must be blocked.");
assert(/reviewConfirmed/.test(entriesRoute), "Entry API must require per-entry review confirmation.");
assert(/create table if not exists public\.audit_logs/.test(auditMigration), "Supabase audit log migration must exist.");
assert(/revoke all on table public\.audit_logs from anon, authenticated/.test(auditMigration), "Audit logs must not be client-readable.");
assert(!/\b(ssn|social_security|routing_number|card_number|payment_card)\s+(text|varchar|numeric|jsonb)/i.test(profileMigration), "Profile schema must not store SSN, banking, or payment card columns.");

console.log("Safety guardrail tests passed.");
