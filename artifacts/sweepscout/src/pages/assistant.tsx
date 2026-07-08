import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FileQuestion,
  ListChecks,
  Scale,
  Search,
  ShieldAlert,
  Sparkles,
  Trophy,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorNotice, LoadingState, SectionHeader } from "@/components/dashboard-kit";
import { Badge, MetricCard, PageHeader, Panel } from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";
import type { AssistantAnswer, AssistantIntent, Sweepstake } from "@/lib/types";

type AssistantMode = {
  intent: AssistantIntent;
  label: string;
  description: string;
  icon: React.ReactNode;
  needsPrimary?: boolean;
  needsCompare?: boolean;
};

const modes: AssistantMode[] = [
  {
    intent: "risk_explanation",
    label: "Why Risky",
    description: "Explain risk score, flags, and compliance notes.",
    icon: <ShieldAlert size={17} aria-hidden="true" />,
    needsPrimary: true,
  },
  {
    intent: "rules_summary",
    label: "Rules Summary",
    description: "Summarize stored official rules and extracted fields.",
    icon: <ClipboardCheck size={17} aria-hidden="true" />,
    needsPrimary: true,
  },
  {
    intent: "compare",
    label: "Compare Two",
    description: "Compare prize, deadline, risk, and eligibility.",
    icon: <Scale size={17} aria-hidden="true" />,
    needsPrimary: true,
    needsCompare: true,
  },
  {
    intent: "can_i_enter",
    label: "Can I Enter?",
    description: "Check profile fit against stored eligibility data.",
    icon: <CheckCircle2 size={17} aria-hidden="true" />,
    needsPrimary: true,
  },
  {
    intent: "manual_checklist",
    label: "Safe Checklist",
    description: "Generate manual-entry steps without automation.",
    icon: <ListChecks size={17} aria-hidden="true" />,
    needsPrimary: true,
  },
  {
    intent: "missing_information",
    label: "Missing Info",
    description: "Identify incomplete rules, prize, and eligibility fields.",
    icon: <FileQuestion size={17} aria-hidden="true" />,
    needsPrimary: true,
  },
  {
    intent: "recommend_today",
    label: "Best Today",
    description: "Recommend highest-value eligible entries today.",
    icon: <Trophy size={17} aria-hidden="true" />,
  },
  {
    intent: "general",
    label: "Ask",
    description: "Ask a grounded question about selected stored data.",
    icon: <Search size={17} aria-hidden="true" />,
    needsPrimary: true,
  },
];

export default function AssistantPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["sweepstakes"],
    queryFn: () => apiGet<Sweepstake[]>("/sweepstakes"),
  });
  const sweepstakes = data ?? [];
  const [intent, setIntent] = useState<AssistantIntent>("risk_explanation");
  const [sweepstakeId, setSweepstakeId] = useState("");
  const [compareSweepstakeId, setCompareSweepstakeId] = useState("");
  const [question, setQuestion] = useState("");
  const selected = sweepstakes.find((item) => item.id === sweepstakeId) ?? null;
  const compareSelected = sweepstakes.find((item) => item.id === compareSweepstakeId) ?? null;
  const activeMode = modes.find((mode) => mode.intent === intent) ?? modes[0];
  const highestValue = useMemo(
    () => sweepstakes.slice().sort((a, b) => (b.prizeRetailValue ?? 0) - (a.prizeRetailValue ?? 0)).slice(0, 4),
    [sweepstakes],
  );
  const ask = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiSend<AssistantAnswer>("/assistant/ask", "POST", body),
  });

  function submit(event?: FormEvent<HTMLFormElement>, overrideIntent = intent) {
    event?.preventDefault();
    ask.mutate({
      intent: overrideIntent,
      sweepstakeId: overrideIntent === "recommend_today" ? undefined : sweepstakeId || undefined,
      compareSweepstakeId: overrideIntent === "compare" ? compareSweepstakeId || undefined : undefined,
      question: question || undefined,
    });
  }

  return (
    <AppShell>
      <PageHeader
        title="AI Assistant"
        kicker="Grounded in stored sweepstakes data"
        description="Explain risk, summarize official rules, compare opportunities, and recommend today’s best entries using only saved records and captured rule text."
      >
        <Badge tone="ok">Rules-grounded</Badge>
        <Badge tone="warn">Manual approval only</Badge>
      </PageHeader>

      {isLoading ? <LoadingState title="Loading assistant context" /> : null}
      {isError ? <ErrorNotice title="Unable to load assistant context" body="The API request failed. Confirm the API server is running." /> : null}

      {data ? (
        <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="grid content-start gap-5">
            <Panel className="bg-[linear-gradient(150deg,rgba(82,211,170,0.12),rgba(20,25,27,0.96)_48%)]">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-accent/30 bg-accent/15 text-accent">
                  <Bot size={22} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-balance text-xl font-semibold text-foreground">SweepScout grounded assistant</h2>
                  <p className="mt-2 text-pretty text-sm leading-6 text-muted">
                    Answers use saved sweepstakes records, extracted rules, official rules text, profile eligibility data, and entry history.
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <MetricCard label="Tracked" value={sweepstakes.length} sublabel="records" />
                <MetricCard label="With Rules" value={sweepstakes.filter((item) => item.rulesText || item.extractedRules).length} />
                <MetricCard label="High Risk" value={sweepstakes.filter((item) => item.scamScore >= 60).length} />
              </div>
            </Panel>

            <Panel>
              <SectionHeader title="Assistant Mode" eyebrow="Capability" />
              <div className="grid gap-2 sm:grid-cols-2">
                {modes.map((mode) => (
                  <button
                    key={mode.intent}
                    type="button"
                    className={
                      intent === mode.intent
                        ? "rounded-md border border-accent/55 bg-accent/15 p-3 text-left text-foreground"
                        : "rounded-md border border-line bg-panel-strong p-3 text-left text-muted transition hover:border-accent/45 hover:text-foreground"
                    }
                    onClick={() => setIntent(mode.intent)}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      {mode.icon}
                      {mode.label}
                    </span>
                    <span className="mt-2 block text-xs leading-5">{mode.description}</span>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel>
              <SectionHeader title="Context" eyebrow={activeMode.label} />
              <form className="grid gap-4" onSubmit={(event) => submit(event)}>
                {activeMode.needsPrimary ? (
                  <Field label="Sweepstakes">
                    <Select value={sweepstakeId} onChange={(event) => setSweepstakeId(event.currentTarget.value)} required>
                      <option value="">Select sweepstakes</option>
                      {sweepstakes.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}

                {activeMode.needsCompare ? (
                  <Field label="Compare against">
                    <Select value={compareSweepstakeId} onChange={(event) => setCompareSweepstakeId(event.currentTarget.value)} required>
                      <option value="">Select second sweepstakes</option>
                      {sweepstakes
                        .filter((item) => item.id !== sweepstakeId)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title}
                          </option>
                        ))}
                    </Select>
                  </Field>
                ) : null}

                <Field label="Question">
                  <textarea
                    className="min-h-28 w-full rounded-md border border-line bg-[#0d1112] px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted/70 focus:border-accent"
                    value={question}
                    onChange={(event) => setQuestion(event.currentTarget.value)}
                    placeholder='Can I enter this? What is missing? Which one is safer?'
                  />
                </Field>

                <button
                  type="submit"
                  disabled={ask.isPending}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-[#08110e] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Sparkles size={16} aria-hidden="true" />
                  Ask Assistant
                </button>
              </form>
            </Panel>

            <Panel>
              <SectionHeader title="Highest Value Candidates" eyebrow="Stored records" />
              <div className="grid gap-2">
                {highestValue.map((item) => (
                  <button
                    key={item.id}
                    className="rounded-md border border-line bg-panel-strong p-3 text-left transition hover:border-accent/50"
                    type="button"
                    onClick={() => {
                      setSweepstakeId(item.id);
                      setIntent("can_i_enter");
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-semibold text-foreground">{item.title}</p>
                      <Badge>{formatCurrency(item.prizeRetailValue)}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      Risk {item.scamScore} | Eligibility {item.eligibilityScore} | Deadline {formatDate(item.endAt)}
                    </p>
                  </button>
                ))}
              </div>
              <button
                className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line bg-panel-strong px-3 text-sm text-foreground transition hover:border-accent/50"
                type="button"
                onClick={() => {
                  setIntent("recommend_today");
                  submit(undefined, "recommend_today");
                }}
              >
                <Trophy size={16} aria-hidden="true" />
                Recommend Today
              </button>
            </Panel>
          </div>

          <div className="grid content-start gap-5">
            {selected ? <SelectedSweepstakePanel item={selected} compare={compareSelected} /> : null}
            <AnswerPanel answer={ask.data ?? null} loading={ask.isPending} error={ask.error} />
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function SelectedSweepstakePanel({ item, compare }: { item: Sweepstake; compare: Sweepstake | null }) {
  return (
    <Panel>
      <SectionHeader title="Selected Record" eyebrow={item.sponsor} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Prize" value={formatCurrency(item.prizeRetailValue)} />
        <MetricCard label="Risk" value={item.scamScore} sublabel={titleCase(item.status)} />
        <MetricCard label="Eligibility" value={`${item.eligibilityScore}%`} />
        <MetricCard label="Deadline" value={formatDate(item.endAt)} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge tone={item.rulesText || item.extractedRules ? "ok" : "warn"}>{item.rulesText || item.extractedRules ? "Rules stored" : "Rules missing"}</Badge>
        <Badge tone={item.purchaseRequired ? "danger" : "ok"}>{item.purchaseRequired ? "Purchase signal" : "No purchase signal"}</Badge>
        <Badge tone={item.noPurchaseMethodFound ? "warn" : "ok"}>{item.noPurchaseMethodFound ? "No-purchase missing" : "No-purchase ok"}</Badge>
        {compare ? <Badge>Comparing with {compare.title}</Badge> : null}
      </div>
      <p className="mt-4 text-sm leading-6 text-muted">{item.complianceNotes[0] ?? item.eligibilitySummary}</p>
    </Panel>
  );
}

function AnswerPanel({ answer, loading, error }: { answer: AssistantAnswer | null; loading: boolean; error: Error | null }) {
  if (loading) {
    return (
      <Panel>
        <div className="flex items-center gap-2 text-sm text-muted">
          <Sparkles className="animate-pulse text-accent" size={17} aria-hidden="true" />
          Building grounded answer
        </div>
      </Panel>
    );
  }
  if (error) {
    return <ErrorNotice title="Assistant request failed" body={error.message} />;
  }
  if (!answer) {
    return (
      <EmptyState
        title="No assistant answer yet"
        body="Choose a capability and stored sweepstakes context to generate a grounded answer."
        action={<Bot size={18} className="text-accent" aria-hidden="true" />}
      />
    );
  }

  return (
    <div className="grid gap-5">
      <Panel className="border-accent/25">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="ok">Grounded</Badge>
          <Badge>{answer.usedOpenAI ? "OpenAI" : "Deterministic"}</Badge>
          <Badge>{answer.model}</Badge>
        </div>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{titleCase(answer.intent)}</h2>
        <p className="mt-3 text-base leading-7 text-foreground">{answer.answer}</p>
        {answer.bullets.length ? (
          <ul className="mt-4 grid gap-2 text-sm leading-6 text-muted">
            {answer.bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2">
                <CheckCircle2 className="mt-1 shrink-0 text-accent" size={15} aria-hidden="true" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      {answer.warnings.length || answer.missingInformation.length ? (
        <Panel className="border-warning/30 bg-warning/10">
          <SectionHeader title="Warnings and Missing Info" eyebrow="Review before entry" />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-2">
              {answer.warnings.map((warning) => (
                <p key={warning} className="flex items-start gap-2 text-sm leading-6 text-warning">
                  <AlertTriangle className="mt-1 shrink-0" size={15} aria-hidden="true" />
                  {warning}
                </p>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {answer.missingInformation.length ? answer.missingInformation.map((item) => <Badge key={item} tone="warn">{item}</Badge>) : <Badge tone="ok">No missing core fields reported</Badge>}
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel>
        <SectionHeader title="Grounding Sources" eyebrow={`${answer.sources.length} stored excerpts`} />
        <div className="grid gap-3">
          {answer.sources.map((source) => (
            <div key={source.id} className="rounded-md border border-line bg-panel-strong p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{source.id}</Badge>
                <Badge>{titleCase(source.field)}</Badge>
                <p className="min-w-0 truncate text-sm font-semibold text-foreground">{source.title}</p>
              </div>
              <p className="mt-2 line-clamp-4 text-sm leading-6 text-muted">{source.snippet}</p>
            </div>
          ))}
        </div>
      </Panel>
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

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="h-10 w-full rounded-md border border-line bg-[#0d1112] px-3 text-sm text-foreground outline-none transition focus:border-accent"
    />
  );
}
