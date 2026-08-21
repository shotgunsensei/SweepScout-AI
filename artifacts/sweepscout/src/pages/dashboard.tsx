import { ArrowRight, BellRing, Bot, CheckCircle2, ScrollText, ShieldAlert, Trophy } from "lucide-react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorNotice, LoadingState, SectionHeader } from "@/components/dashboard-kit";
import { OpportunityCard } from "@/components/opportunity-card";
import { Badge, MetricCard, PageHeader, Panel } from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/format";
import type { FlightDeckData } from "@/lib/types";

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["dashboard"], queryFn: () => apiGet<FlightDeckData>("/dashboard") });
  const action = useMutation({
    mutationFn: ({ id, kind, value }: { id: string; kind: "save" | "hide"; value?: boolean }) =>
      kind === "save"
        ? apiSend(`/opportunities/${id}/save`, "PUT", { saved: value })
        : apiSend(`/opportunities/${id}/status`, "PUT", { status: "hidden" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <AppShell>
      <PageHeader
        title="Flight Deck"
        kicker="Today's opportunity plan"
        description="Review the best-fit opportunities, urgent deadlines, and safety signals before visiting a sponsor's official sweepstakes."
      >
        <Link href="/dashboard/assistant" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-panel-strong px-3 text-sm font-medium text-foreground hover:border-accent/50">
          Ask AI <Bot size={16} aria-hidden="true" />
        </Link>
        <Link href="/dashboard/sweepstakes" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-background-deep hover:bg-accent-strong">
          Open Radar <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </PageHeader>

      {query.isLoading ? <LoadingState title="Preparing your flight plan" /> : null}
      {query.isError ? <ErrorNotice title="Unable to load dashboard" body={(query.error as Error)?.message || "The Flight Deck is temporarily unavailable."} /> : null}
      {query.data ? <DashboardBody data={query.data} busy={action.isPending} run={action.mutate} /> : null}
    </AppShell>
  );
}

function DashboardBody({ data, busy, run }: { data: FlightDeckData; busy: boolean; run: (input: { id: string; kind: "save" | "hide"; value?: boolean }) => void }) {
  const totalPrizeValue = data.opportunities.reduce((sum, item) => sum + (item.estimatedPrizeValue ?? 0), 0);
  return (
    <>
      <Panel className="mb-5 overflow-hidden border-accent/20 bg-[linear-gradient(135deg,hsl(var(--accent)/0.13),hsl(var(--panel)/0.92)_48%)]">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge tone="ok">User-controlled</Badge>
              <Badge>Personalized discovery</Badge>
              <Badge tone="warn">No auto-submit</Badge>
            </div>
            <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Today’s flight plan</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">Focus on the opportunities worth your time, handle due entries, and review official rules before taking action.</p>
          </div>
          <div className="grid min-w-72 gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <Badge tone="ok"><Trophy size={13} aria-hidden="true" /> Visible value {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(totalPrizeValue)}</Badge>
            <Badge tone={data.stats.unreadAlerts ? "warn" : "ok"}>{data.stats.unreadAlerts} unread alerts</Badge>
            <Badge tone={data.stats.riskFlags ? "danger" : "ok"}>{data.stats.riskFlags} risk flags</Badge>
          </div>
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Radar Matches" value={data.stats.opportunityMatches} sublabel="normalized opportunities" />
        <MetricCard label="Eligible in Briefing" value={data.stats.eligibleMatches} sublabel="based on your profile" tone="ok" />
        <MetricCard label="Ending Soon" value={data.stats.endingSoon} sublabel="within 7 days" tone={data.stats.endingSoon ? "warn" : "default"} />
        <MetricCard label="Saved Missions" value={data.stats.saved} sublabel="in your Hangar" />
        <MetricCard label="Entered Today" value={data.stats.entriesToday} sublabel="user-reported" tone="ok" />
        <MetricCard label="Due Entries" value={data.stats.dueEntries} sublabel="repeat schedule" tone={data.stats.dueEntries ? "warn" : "default"} />
        <MetricCard label="Unread Alerts" value={data.stats.unreadAlerts} sublabel="monitoring signals" tone={data.stats.unreadAlerts ? "warn" : "default"} />
        <MetricCard label="Risk Flags" value={data.stats.riskFlags} sublabel="review before visiting" tone={data.stats.riskFlags ? "danger" : "default"} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <Panel>
          <SectionHeader title="Priority opportunities" eyebrow="Best-fit matches" action={<Link href="/dashboard/sweepstakes" className="text-sm text-accent">View all</Link>} />
          <div className="grid gap-3">
            {data.opportunities.length ? data.opportunities.slice(0, 4).map((item) => (
              <OpportunityCard
                key={item.id}
                item={item}
                busy={busy}
                onSave={() => run({ id: item.id, kind: "save", value: !item.saved })}
                onHide={() => run({ id: item.id, kind: "hide" })}
              />
            )) : <EmptyState title="No opportunity matches yet" body="Approved sources and reviewed listings will appear here as Radar finds matches for your profile." image="/brand/illustrations/play-pack-pilot-radar-empty.webp" />}
          </div>
        </Panel>

        <div className="grid content-start gap-4">
          <Panel>
            <SectionHeader title="Safety checks" eyebrow="Always-on guardrails" />
            <div className="grid gap-3 text-sm">
              <div className="flex items-center gap-2 text-ok"><CheckCircle2 size={17} aria-hidden="true" /> You choose every sponsor-site action</div>
              <div className="flex items-center gap-2 text-warning"><ShieldAlert size={17} aria-hidden="true" /> CAPTCHA and verification stay manual</div>
              <div className="flex items-center gap-2 text-muted"><ScrollText size={17} aria-hidden="true" /> Official rules remain authoritative</div>
            </div>
          </Panel>
          <Panel>
            <SectionHeader title="Flight alerts" eyebrow="Personal monitoring" action={<Link href="/dashboard/alerts" className="text-sm text-accent">Open alerts</Link>} />
            <div className="grid gap-3">
              {data.notifications.map((notification) => (
                <article key={notification.id} className={`rounded-xl border p-3 ${notification.read_at ? "border-line bg-panel-strong/45" : "border-accent/35 bg-accent/5"}`}>
                  <div className="flex items-start gap-3"><BellRing size={17} className="mt-0.5 shrink-0 text-accent" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{notification.title}</p><Badge tone={notification.priority >= 80 ? "warn" : "default"}>{titleCase(notification.type)}</Badge></div><p className="mt-1 text-sm leading-6 text-muted">{notification.body}</p><p className="mt-2 text-xs text-muted">{formatDate(notification.created_at)}</p></div></div>
                </article>
              ))}
              {!data.notifications.length ? <EmptyState title="Radar is quiet" body="New matches, deadlines, rules changes, scan results, credit warnings, and billing alerts will appear here." /> : null}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
