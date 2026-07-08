import { getStore } from "@/lib/storage/store";
import type { ComplianceReport, ComplianceSweepstakeReport, EntryLog, Sweepstake } from "@/lib/types";

export async function getComplianceReport(): Promise<ComplianceReport> {
  const store = await getStore();
  const [sweepstakes, entries] = await Promise.all([store.listSweepstakes(), store.listEntryLogs()]);
  const generatedAt = new Date().toISOString();
  return {
    generatedAt,
    reports: sweepstakes.map((sweepstake) => buildComplianceSweepstakeReport(sweepstake, entries, generatedAt)),
  };
}

export async function getComplianceSweepstakeReport(sweepstakeId: string) {
  const report = await getComplianceReport();
  const item = report.reports.find((candidate) => candidate.sweepstakeId === sweepstakeId);
  if (!item) {
    throw new Error("Sweepstake compliance report not found.");
  }
  return item;
}

export function complianceReportToCsv(report: ComplianceReport) {
  return rowsToCsv([csvHeaders(), ...report.reports.map(reportToCsvRow)]);
}

export function complianceSweepstakeReportToCsv(report: ComplianceSweepstakeReport) {
  return rowsToCsv([csvHeaders(), reportToCsvRow(report)]);
}

export function complianceSweepstakeReportToPdf(report: ComplianceSweepstakeReport) {
  const lines = [
    "SweepScout Compliance Report",
    `Generated: ${formatDateTime(report.generatedAt)}`,
    "",
    `Sweepstake: ${report.title}`,
    `Sponsor: ${report.sponsor}`,
    `Status: ${report.status}`,
    `Official Rules URL: ${report.officialRulesUrl ?? "Not captured"}`,
    `Source URL: ${report.sourceUrl}`,
    `Entry Frequency: ${report.entryFrequency}`,
    `No-Purchase Method: ${report.noPurchaseMethod}`,
    `Eligibility: ${report.eligibility}`,
    `Deadline: ${formatDateTime(report.deadline)}`,
    "",
    "Extracted Risk Notes:",
    ...(report.extractedRiskNotes.length ? report.extractedRiskNotes.map((note) => `- ${note}`) : ["- None captured."]),
    "",
    "User Decision History:",
    ...(report.userDecisionHistory.length
      ? report.userDecisionHistory.flatMap((decision) => [
          `- ${decision.status} at ${formatDateTime(decision.attemptedAt)}`,
          `  Submitted: ${formatDateTime(decision.submittedAt)}`,
          `  User approved: ${decision.userApproved ? "yes" : "no"}`,
          `  Purchase acknowledged: ${decision.purchaseRequiredAcknowledged ? "yes" : "no"}`,
          `  Confirmation: ${decision.confirmationCode ?? "none"}`,
          `  Notes: ${decision.notes || "none"}`,
        ])
      : ["- No decisions logged."]),
    "",
    "Submission Timestamps:",
    ...(report.submissionTimestamps.length
      ? report.submissionTimestamps.map((timestamp) => `- ${formatDateTime(timestamp)}`)
      : ["- No manual submissions logged."]),
  ];

  return buildSimplePdf(wrapLines(lines, 96));
}

function buildComplianceSweepstakeReport(
  sweepstake: Sweepstake,
  entries: EntryLog[],
  generatedAt: string,
): ComplianceSweepstakeReport {
  const sweepstakeEntries = entries
    .filter((entry) => entry.sweepstakeId === sweepstake.id)
    .sort((a, b) => new Date(a.attemptedAt).getTime() - new Date(b.attemptedAt).getTime());
  const riskNotes = [
    ...sweepstake.complianceNotes,
    ...sweepstake.riskFlags.map((flag) => `${flag.severity.toUpperCase()}: ${flag.label}`),
    ...(sweepstake.extractedRules?.redFlags ?? []),
  ];

  return {
    sweepstakeId: sweepstake.id,
    title: sweepstake.title,
    status: sweepstake.status,
    officialRulesUrl: sweepstake.extractedRules?.officialRulesUrl ?? sweepstake.rulesUrl,
    sourceUrl: sweepstake.url,
    sponsor: sweepstake.sponsor,
    entryFrequency: sweepstake.entryFrequency,
    noPurchaseMethod: noPurchaseMethodFor(sweepstake),
    eligibility: sweepstake.extractedRules?.eligibility ?? sweepstake.eligibilitySummary,
    deadline: sweepstake.extractedRules?.deadline ?? sweepstake.endAt,
    extractedRiskNotes: dedupe(riskNotes),
    userDecisionHistory: sweepstakeEntries.map((entry) => ({
      entryId: entry.id,
      status: entry.status,
      attemptedAt: entry.attemptedAt,
      submittedAt: entry.submittedAt,
      userApproved: entry.userApproved,
      purchaseRequiredAcknowledged: entry.purchaseRequiredAcknowledged,
      notes: entry.notes,
      confirmationCode: entry.confirmationCode,
    })),
    submissionTimestamps: sweepstakeEntries
      .filter((entry) => entry.status === "submitted")
      .map((entry) => entry.submittedAt ?? entry.attemptedAt),
    generatedAt,
  };
}

function noPurchaseMethodFor(sweepstake: Sweepstake) {
  if (sweepstake.extractedRules?.noPurchaseMethod) {
    return sweepstake.extractedRules.noPurchaseMethod;
  }
  if (sweepstake.noPurchaseMethodFound) {
    return "Not found in extracted rules.";
  }
  if (sweepstake.purchaseRequired) {
    return "Purchase required flag is active; no no-purchase method captured.";
  }
  return "No purchase required or no-purchase language detected.";
}

function csvHeaders() {
  return [
    "sweepstake_id",
    "title",
    "status",
    "official_rules_url",
    "source_url",
    "sponsor",
    "entry_frequency",
    "no_purchase_method",
    "eligibility",
    "deadline",
    "extracted_risk_notes",
    "user_decision_history",
    "submission_timestamps",
    "generated_at",
  ];
}

function reportToCsvRow(report: ComplianceSweepstakeReport) {
  return [
    report.sweepstakeId,
    report.title,
    report.status,
    report.officialRulesUrl ?? "",
    report.sourceUrl,
    report.sponsor,
    report.entryFrequency,
    report.noPurchaseMethod,
    report.eligibility,
    report.deadline ?? "",
    report.extractedRiskNotes.join(" | "),
    report.userDecisionHistory
      .map(
        (decision) =>
          `${decision.status} attempted=${decision.attemptedAt} submitted=${decision.submittedAt ?? ""} approved=${decision.userApproved} notes=${decision.notes}`,
      )
      .join(" | "),
    report.submissionTimestamps.join(" | "),
    report.generatedAt,
  ];
}

function rowsToCsv(rows: string[][]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

function dedupe(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function formatDateTime(value: string | null) {
  if (!value) return "Not captured";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : value;
}

function wrapLines(lines: string[], width: number) {
  const wrapped: string[] = [];
  for (const line of lines) {
    if (line.length <= width) {
      wrapped.push(line);
      continue;
    }
    const words = line.split(/\s+/);
    let current = "";
    for (const word of words) {
      if (`${current} ${word}`.trim().length > width) {
        if (current) wrapped.push(current);
        current = word;
      } else {
        current = `${current} ${word}`.trim();
      }
    }
    if (current) wrapped.push(current);
  }
  return wrapped;
}

function buildSimplePdf(lines: string[]) {
  const pageLineCount = 48;
  const pages = chunk(lines, pageLineCount);
  const objects: string[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(
    `<< /Type /Pages /Kids [${pages.map((_page, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );

  pages.forEach((pageLines, index) => {
    const pageObjectId = 3 + index * 2;
    const contentObjectId = pageObjectId + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${contentObjectId} 0 R >>`);
    const content = renderPdfTextPage(pageLines, index + 1, pages.length);
    objects.push(`<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`);
  });

  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body, "utf8");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(body, "utf8");
}

function renderPdfTextPage(lines: string[], page: number, totalPages: number) {
  const escaped = [
    "BT",
    "/F1 10 Tf",
    "48 744 Td",
    "14 TL",
    ...lines.map((line) => `(${escapePdfString(line)}) Tj T*`),
    "T*",
    `(${escapePdfString(`Page ${page} of ${totalPages}`)}) Tj`,
    "ET",
  ];
  return escaped.join("\n");
}

function escapePdfString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks.length ? chunks : [[]];
}
