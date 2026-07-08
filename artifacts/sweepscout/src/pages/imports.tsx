import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardPaste,
  FileText,
  Image,
  Link as LinkIcon,
  Plus,
  Upload,
} from "lucide-react";
import { Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { SectionHeader } from "@/components/dashboard-kit";
import { Badge, Checkbox, MetricCard, PageHeader, Panel, TextInput } from "@/components/ui";
import { apiSend } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/format";
import type { ImportItemResult, ImportRunReport } from "@/lib/types";

type ImportRequest = {
  path: string;
  body: Record<string, unknown>;
};

export default function ImportsPage() {
  const queryClient = useQueryClient();
  const [report, setReport] = useState<ImportRunReport | null>(null);
  const runImport = useMutation({
    mutationFn: (request: ImportRequest) => apiSend<ImportRunReport>(request.path, "POST", request.body),
    onSuccess: async (data) => {
      setReport(data);
      await queryClient.invalidateQueries();
    },
  });

  return (
    <AppShell>
      <PageHeader title="Import Tools" kicker="Normalize, extract, score, queue">
        <Badge tone="ok">Manual approval preserved</Badge>
        <Badge tone="warn">No auto-submit</Badge>
      </PageHeader>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-5">
          <UrlListImport runImport={runImport} />
          <CsvImport runImport={runImport} />
          <BookmarkImport runImport={runImport} />
        </div>
        <div className="grid content-start gap-5">
          <ManualImport runImport={runImport} />
          <TextImport runImport={runImport} />
          <ImportSafetyPanel />
        </div>
      </div>

      <ImportResults report={report} pending={runImport.isPending} error={runImport.error} />
    </AppShell>
  );
}

function UrlListImport({ runImport }: { runImport: ImportMutation }) {
  const [urlsText, setUrlsText] = useState("");
  return (
    <Panel>
      <ImportHeader icon={<LinkIcon size={18} aria-hidden="true" />} title="Pasted URL List" eyebrow="Bulk links" />
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          runImport.mutate({ path: "/imports/urls", body: { urlsText, extractRules: formChecked(event.currentTarget, "extractRules") } });
        }}
      >
        <Textarea
          value={urlsText}
          onChange={(event) => setUrlsText(event.currentTarget.value)}
          placeholder="https://example.com/giveaway&#10;Local Radio Car Giveaway https://station.example/contest"
          required
        />
        <Checkbox name="extractRules" label="Extract official rules from source URLs" defaultChecked />
        <ImportSubmit disabled={runImport.isPending}>Import URLs</ImportSubmit>
      </form>
    </Panel>
  );
}

function CsvImport({ runImport }: { runImport: ImportMutation }) {
  const [csvText, setCsvText] = useState("");
  return (
    <Panel>
      <ImportHeader icon={<FileText size={18} aria-hidden="true" />} title="CSV Import" eyebrow="URL, title, sponsor, rules_url" />
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          runImport.mutate({ path: "/imports/csv", body: { csvText, extractRules: formChecked(event.currentTarget, "extractRules") } });
        }}
      >
        <FilePicker accept=".csv,text/csv" onText={setCsvText} />
        <Textarea
          value={csvText}
          onChange={(event) => setCsvText(event.currentTarget.value)}
          placeholder="url,title,sponsor,rules_url&#10;https://example.com/sweeps,Example Giveaway,Example Sponsor,https://example.com/rules"
          required
        />
        <Checkbox name="extractRules" label="Extract rules for URL-only rows" defaultChecked />
        <ImportSubmit disabled={runImport.isPending}>Import CSV</ImportSubmit>
      </form>
    </Panel>
  );
}

function BookmarkImport({ runImport }: { runImport: ImportMutation }) {
  const [bookmarkHtml, setBookmarkHtml] = useState("");
  return (
    <Panel>
      <ImportHeader icon={<BookOpen size={18} aria-hidden="true" />} title="Browser Bookmarks" eyebrow="Netscape HTML export" />
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          runImport.mutate({
            path: "/imports/bookmarks",
            body: { bookmarkHtml, extractRules: formChecked(event.currentTarget, "extractRules") },
          });
        }}
      >
        <FilePicker accept=".html,.htm,text/html" onText={setBookmarkHtml} />
        <Textarea
          value={bookmarkHtml}
          onChange={(event) => setBookmarkHtml(event.currentTarget.value)}
          placeholder='<A HREF="https://example.com/giveaway">Example Giveaway</A>'
          required
        />
        <Checkbox name="extractRules" label="Extract rules after bookmark import" defaultChecked />
        <ImportSubmit disabled={runImport.isPending}>Import Bookmarks</ImportSubmit>
      </form>
    </Panel>
  );
}

function ManualImport({ runImport }: { runImport: ImportMutation }) {
  return (
    <Panel>
      <ImportHeader icon={<Plus size={18} aria-hidden="true" />} title="Manual Add" eyebrow="Single sweepstakes" />
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          runImport.mutate({ path: "/imports/manual", body: formBody(event.currentTarget) });
        }}
      >
        <Field label="Source URL">
          <TextInput name="url" type="url" required placeholder="https://example.com/giveaway" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title">
            <TextInput name="title" />
          </Field>
          <Field label="Sponsor">
            <TextInput name="sponsor" />
          </Field>
        </div>
        <Field label="Official rules URL">
          <TextInput name="rulesUrl" type="url" />
        </Field>
        <Field label="Entry form URL">
          <TextInput name="formUrl" type="url" />
        </Field>
        <Field label="Notes">
          <Textarea name="notes" rows={5} />
        </Field>
        <Checkbox name="extractRules" label="Extract official rules from source URL" defaultChecked />
        <ImportSubmit disabled={runImport.isPending}>Add Sweepstake</ImportSubmit>
      </form>
    </Panel>
  );
}

function TextImport({ runImport }: { runImport: ImportMutation }) {
  return (
    <Panel>
      <ImportHeader icon={<Image size={18} aria-hidden="true" />} title="Screenshot / Manual Text" eyebrow="Rules text extraction" />
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          runImport.mutate({ path: "/imports/text", body: formBody(event.currentTarget) });
        }}
      >
        <Field label="Source URL">
          <TextInput name="url" type="url" required placeholder="https://example.com/giveaway" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title">
            <TextInput name="title" />
          </Field>
          <Field label="Sponsor">
            <TextInput name="sponsor" />
          </Field>
        </div>
        <Field label="Official rules URL">
          <TextInput name="rulesUrl" type="url" />
        </Field>
        <Field label="Rules text / OCR text">
          <Textarea name="manualText" rows={9} required />
        </Field>
        <Checkbox name="extractRules" label="Also re-check source URL after saving" />
        <ImportSubmit disabled={runImport.isPending}>Extract Text</ImportSubmit>
      </form>
    </Panel>
  );
}

function ImportSafetyPanel() {
  return (
    <Panel className="border-warning/25 bg-warning/10">
      <SectionHeader title="Import Guardrails" eyebrow="Safety" />
      <div className="grid gap-3 text-sm leading-6 text-muted">
        <SafetyLine icon={<CheckCircle2 size={16} aria-hidden="true" />} tone="ok" text="Imported records still require manual review before entry." />
        <SafetyLine icon={<AlertTriangle size={16} aria-hidden="true" />} tone="warn" text="Payment, SSN, banking, and missing-rules signals are flagged." />
        <SafetyLine icon={<Upload size={16} aria-hidden="true" />} text="Batches are capped at 50 items per run." />
      </div>
    </Panel>
  );
}

function ImportResults({
  report,
  pending,
  error,
}: {
  report: ImportRunReport | null;
  pending: boolean;
  error: Error | null;
}) {
  if (pending) {
    return (
      <Panel className="mt-5">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Upload className="animate-pulse text-accent" size={17} aria-hidden="true" />
          Import running
        </div>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel className="mt-5 border-danger/35 bg-danger/10">
        <p className="text-sm text-danger">{error.message}</p>
      </Panel>
    );
  }

  if (!report) return null;

  return (
    <div className="mt-5 grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Parsed" value={report.totals.parsed} sublabel={sourceLabel(report.source)} />
        <MetricCard label="Created" value={report.totals.created} />
        <MetricCard label="Updated" value={report.totals.updated} />
        <MetricCard label="Extracted" value={report.totals.extracted} />
        <MetricCard label="Entry Queue" value={report.totals.queuedForEntry} />
        <MetricCard label="Review Queue" value={report.totals.queuedForReview} />
      </div>
      <Panel>
        <SectionHeader title="Import Results" eyebrow={`Generated ${formatDate(report.generatedAt)}`} />
        <div className="grid gap-3">
          {report.items.map((item, index) => (
            <ImportResultRow key={`${item.inputUrl}-${index}`} item={item} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function ImportResultRow({ item }: { item: ImportItemResult }) {
  return (
    <div className="rounded-md border border-line bg-panel-strong p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={item.status === "failed" ? "danger" : item.status === "created" ? "ok" : "default"}>
              {titleCase(item.status)}
            </Badge>
            <Badge tone={extractionTone(item.extractionStatus)}>{titleCase(item.extractionStatus)}</Badge>
            <Badge tone={placementTone(item.queuePlacement)}>{titleCase(item.queuePlacement)}</Badge>
          </div>
          <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-foreground">{item.title ?? item.inputUrl}</h3>
          <p className="mt-1 truncate text-xs text-muted">{item.normalizedUrl ?? item.inputUrl}</p>
          <p className="mt-2 text-sm leading-6 text-muted">{item.message}</p>
        </div>
        <div className="grid gap-2 lg:w-48">
          <div className="grid grid-cols-2 gap-2">
            <ScoreBox label="Risk" value={item.scamScore} dangerHigh />
            <ScoreBox label="Elig." value={item.eligibilityScore} />
          </div>
          {item.sweepstakeId ? (
            <Link
              href={`/dashboard/sweepstakes`}
              className="inline-flex h-9 items-center justify-center rounded-md border border-line bg-panel px-3 text-sm text-foreground hover:border-accent/50"
            >
              View Database
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ScoreBox({ label, value, dangerHigh = false }: { label: string; value: number | null; dangerHigh?: boolean }) {
  const tone = value === null ? "text-muted" : dangerHigh ? (value >= 60 ? "text-danger" : value >= 40 ? "text-warning" : "text-ok") : value >= 75 ? "text-ok" : value >= 50 ? "text-warning" : "text-danger";
  return (
    <div className="rounded-md border border-line bg-background/45 p-2">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone}`}>{value ?? "-"}</p>
    </div>
  );
}

function ImportHeader({ icon, title, eyebrow }: { icon: React.ReactNode; title: string; eyebrow: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-panel-strong text-accent">
        {icon}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase text-muted">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">{title}</h2>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`min-h-32 w-full rounded-md border border-line bg-[#0d1112] px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted/70 focus:border-accent ${props.className ?? ""}`}
    />
  );
}

function FilePicker({ accept, onText }: { accept: string; onText: (text: string) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-line bg-panel-strong px-3 text-sm font-medium text-foreground hover:border-accent/50">
      <Upload size={16} aria-hidden="true" />
      Select File
      <input
        className="sr-only"
        type="file"
        accept={accept}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) {
            void file.text().then(onText);
          }
        }}
      />
    </label>
  );
}

function ImportSubmit({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-[#08110e] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      type="submit"
      disabled={disabled}
    >
      <ClipboardPaste size={16} aria-hidden="true" />
      {children}
    </button>
  );
}

function SafetyLine({ icon, text, tone }: { icon: React.ReactNode; text: string; tone?: "ok" | "warn" }) {
  return (
    <div className={tone === "ok" ? "flex items-start gap-2 text-ok" : tone === "warn" ? "flex items-start gap-2 text-warning" : "flex items-start gap-2"}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function formBody(form: HTMLFormElement) {
  const data = new FormData(form);
  const body: Record<string, unknown> = {};
  data.forEach((value, key) => {
    body[key] = value;
  });
  return body;
}

function formChecked(form: HTMLFormElement, name: string) {
  return new FormData(form).has(name);
}

function extractionTone(status: ImportItemResult["extractionStatus"]) {
  if (status === "completed") return "ok";
  if (status === "failed") return "danger";
  if (status === "needs_review" || status === "needs_upgrade") return "warn";
  return "default";
}

function placementTone(placement: ImportItemResult["queuePlacement"]) {
  if (placement === "entry_queue") return "ok";
  if (placement === "blocked" || placement === "failed") return "danger";
  if (placement === "review_queue") return "warn";
  return "default";
}

function sourceLabel(source: ImportRunReport["source"]) {
  if (source === "url_list") return "URL list";
  if (source === "bookmarks") return "Bookmarks";
  if (source === "text") return "Manual text";
  return source.toUpperCase();
}

type ImportMutation = UseMutationResult<ImportRunReport, Error, ImportRequest, unknown>;
