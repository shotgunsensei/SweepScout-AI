import { useEffect, useMemo, useState } from "react";
import { Filter, Radar, RotateCcw, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorNotice, LoadingState } from "@/components/dashboard-kit";
import { OpportunityCard } from "@/components/opportunity-card";
import { Badge, PageHeader, Panel } from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api";
import { defaultRadarFilters, parseRadarSearch, radarApiPath, radarSearch, type RadarFilterState } from "@/lib/radar";
import type { RadarPage } from "@/lib/types";

const quickViews = [
  { label: "Best matches", values: { sort: "recommended", frequency: "" } }, { label: "New", values: { sort: "newest", frequency: "" } },
  { label: "Ending soon", values: { sort: "ending_soon", frequency: "" } }, { label: "Highest value", values: { sort: "highest_prize", frequency: "" } },
  { label: "Lowest effort", values: { sort: "lowest_effort", frequency: "" } }, { label: "Daily entries", values: { sort: "recommended", frequency: "daily" } },
  { label: "One-time", values: { sort: "recommended", frequency: "one_time" } }, { label: "Recently verified", values: { sort: "recently_verified", frequency: "" } },
  { label: "Popular saves", values: { sort: "popular", frequency: "" } },
] as const;

export default function SweepstakesPage() {
  const [filters, setFilters] = useState(() => parseRadarSearch(window.location.search));
  const queryClient = useQueryClient();
  useEffect(() => { const sync = () => setFilters(parseRadarSearch(window.location.search)); window.addEventListener("popstate", sync); return () => window.removeEventListener("popstate", sync); }, []);
  const radar = useQuery({ queryKey: ["radar", filters], queryFn: () => apiGet<RadarPage>(radarApiPath(filters)) });
  const action = useMutation({
    mutationFn: ({ id, kind, value }: { id: string; kind: "save" | "hide"; value?: boolean }) => kind === "save" ? apiSend(`/opportunities/${id}/save`, "PUT", { saved: value === true }) : apiSend(`/opportunities/${id}/status`, "PUT", { status: "hidden" }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["radar"] }); toast.success("Radar updated"); }, onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to update opportunity"),
  });
  const update = (patch: Partial<RadarFilterState>, resetPage = true) => {
    const next = { ...filters, ...patch, ...(resetPage ? { page: "1" } : {}) }; setFilters(next);
    window.history.replaceState(null, "", `${window.location.pathname}${radarSearch(next)}`);
  };
  const activeCount = useMemo(() => Object.entries(filters).filter(([key, value]) => value && value !== defaultRadarFilters[key as keyof RadarFilterState]).length, [filters]);

  return (
    <AppShell>
      <PageHeader title="Opportunity Radar" kicker="AI sweepstakes discovery" description="Search verified opportunities, tune your mission profile, and open the sponsor's official promotion when you are ready.">
        <Badge tone="ok"><Radar size={14} /> Live normalized data</Badge><Badge tone="warn">Verify sponsor rules</Badge>
      </PageHeader>
      <div className="grid min-w-0 gap-5">
        <Panel className="min-w-0 overflow-hidden border-accent/25 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.18),transparent_40%),var(--panel)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
            <label className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-lg border border-line bg-navigation/75 px-4 focus-within:border-accent">
              <Search size={19} className="text-accent" /><span className="sr-only">Search opportunities</span>
              <input value={filters.q} onChange={(event) => update({ q: event.currentTarget.value })} placeholder="Search title, sponsor, prize, category, eligibility, or entry method" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted" />
            </label>
            <button type="button" onClick={() => update(defaultRadarFilters)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line px-4 text-sm text-muted hover:text-foreground"><RotateCcw size={16} />Reset</button>
          </div>
          <div className="mt-4 flex max-w-full gap-2 overflow-x-auto pb-1" aria-label="Radar views">
            {quickViews.map((view) => { const active = filters.sort === view.values.sort && filters.frequency === view.values.frequency; return <button key={view.label} type="button" onClick={() => update(view.values)} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold transition ${active ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-foreground"}`}>{view.label}</button>; })}
          </div>
        </Panel>

        <details className="group min-w-0 overflow-hidden rounded-xl border border-line bg-panel/90" open={activeCount > 1}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4"><span className="inline-flex items-center gap-2 font-semibold"><SlidersHorizontal size={17} className="text-accent" />Mission filters</span><Badge><Filter size={13} />{activeCount} active</Badge></summary>
          <div className="grid gap-4 border-t border-line p-5 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Category"><input value={filters.category} onChange={(e) => update({ category: e.currentTarget.value.toLowerCase().replace(/\s+/g, "-") })} placeholder="travel" /></Field>
            <Field label="Minimum prize"><input type="number" min="0" value={filters.minPrize} onChange={(e) => update({ minPrize: e.currentTarget.value })} placeholder="$0" /></Field>
            <Field label="Deadline before"><input type="date" value={filters.deadlineBefore} onChange={(e) => update({ deadlineBefore: e.currentTarget.value })} /></Field>
            <Field label="Starts after"><input type="date" value={filters.startAfter} onChange={(e) => update({ startAfter: e.currentTarget.value })} /></Field>
            <SelectField label="Entry frequency" value={filters.frequency} onChange={(value) => update({ frequency: value })} options={["daily", "one_time", "weekly", "monthly", "unlimited"]} />
            <Field label="Maximum effort"><input type="number" min="0" max="100" value={filters.maxEffort} onChange={(e) => update({ maxEffort: e.currentTarget.value })} placeholder="100" /></Field>
            <Field label="Country"><input maxLength={2} value={filters.country} onChange={(e) => update({ country: e.currentTarget.value.toUpperCase() })} placeholder="US" /></Field>
            <Field label="State or region"><input value={filters.region} onChange={(e) => update({ region: e.currentTarget.value })} placeholder="NY" /></Field>
            <Field label="Your age"><input type="number" min="0" max="130" value={filters.age} onChange={(e) => update({ age: e.currentTarget.value })} /></Field>
            <Field label="Sponsor"><input value={filters.sponsor} onChange={(e) => update({ sponsor: e.currentTarget.value })} /></Field>
            <SelectField label="Purchase requirement" value={filters.purchaseRequired} onChange={(value) => update({ purchaseRequired: value })} options={["false", "true"]} labels={["No purchase", "Purchase-related"]} />
            <SelectField label="Social requirement" value={filters.socialRequired} onChange={(value) => update({ socialRequired: value })} options={["false", "true"]} labels={["No social action", "Social action"]} />
            <Field label="Minimum legitimacy"><input type="number" min="0" max="100" value={filters.minLegitimacy} onChange={(e) => update({ minLegitimacy: e.currentTarget.value })} /></Field>
            <Field label="Minimum source confidence"><input type="number" min="0" max="100" value={filters.minSourceConfidence} onChange={(e) => update({ minSourceConfidence: e.currentTarget.value })} /></Field>
            <SelectField label="Saved status" value={filters.saved} onChange={(value) => update({ saved: value })} options={["true", "false"]} labels={["Saved", "Not saved"]} />
            <SelectField label="Entered status" value={filters.entered} onChange={(value) => update({ entered: value })} options={["true", "false"]} labels={["Entered", "Not entered"]} />
          </div>
        </details>

        {radar.isLoading ? <LoadingState title="Scanning the opportunity radar" /> : null}
        {radar.isError ? <ErrorNotice title="Radar connection unavailable" body="The normalized Supabase radar could not be loaded. Confirm migrations and deployment environment variables are configured." /> : null}
        {radar.data ? <>
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-accent">Radar results</p><h2 className="mt-1 text-2xl font-bold">{radar.data.total} active opportunities</h2></div><p className="text-sm text-muted">Page {radar.data.page} · expired listings excluded</p></div>
          <div className="grid gap-4">{radar.data.items.map((item) => <OpportunityCard key={item.id} item={item} busy={action.isPending} onSave={() => action.mutate({ id: item.id, kind: "save", value: !item.saved })} onHide={() => action.mutate({ id: item.id, kind: "hide" })} />)}</div>
          {!radar.data.items.length ? <EmptyState title="No opportunities match this flight plan" body="Widen a deadline, effort, location, or confidence filter. The radar never fills empty results with placeholder promotions." action={<Sparkles size={20} className="text-accent" />} /> : null}
          {radar.data.total > radar.data.pageSize ? <div className="flex items-center justify-center gap-3"><button disabled={radar.data.page <= 1} onClick={() => update({ page: String(radar.data!.page - 1) }, false)} className="rounded-md border border-line px-4 py-2 text-sm disabled:opacity-40">Previous</button><button disabled={!radar.data.hasMore} onClick={() => update({ page: String(radar.data!.page + 1) }, false)} className="rounded-md bg-accent-strong px-4 py-2 text-sm font-semibold disabled:opacity-40">Next page</button></div> : null}
        </> : null}
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactElement<{ className?: string }> }) { return <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><span>{label}</span><span className="[&>input]:h-10 [&>input]:w-full [&>input]:rounded-md [&>input]:border [&>input]:border-line [&>input]:bg-panel-strong [&>input]:px-3 [&>input]:text-sm [&>input]:font-normal [&>input]:normal-case [&>input]:text-foreground [&>input]:outline-none focus-within:[&>input]:border-accent">{children}</span></label>; }
function SelectField({ label, value, onChange, options, labels }: { label: string; value: string; onChange: (value: string) => void; options: string[]; labels?: string[] }) { return <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><span>{label}</span><select value={value} onChange={(e) => onChange(e.currentTarget.value)} className="h-10 rounded-md border border-line bg-panel-strong px-3 text-sm font-normal normal-case text-foreground outline-none focus:border-accent"><option value="">Any</option>{options.map((option, index) => <option key={option} value={option}>{labels?.[index] ?? option.replace(/_/g, " ")}</option>)}</select></label>; }
