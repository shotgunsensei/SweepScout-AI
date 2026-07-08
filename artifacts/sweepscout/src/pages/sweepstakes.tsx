import { useMemo, useState } from "react";
import { Database, Filter, Search, SlidersHorizontal, Trophy, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorNotice, LoadingState, SectionHeader } from "@/components/dashboard-kit";
import { Badge, MetricCard, PageHeader, Panel } from "@/components/ui";
import { SweepstakesCard } from "@/components/sweepstakes-card";
import { apiGet } from "@/lib/api";
import { formatCurrency, titleCase } from "@/lib/format";
import { categoryLabel, PRIZE_CATEGORIES } from "@/lib/prize-categories";
import type { PrizeCategory, Sweepstake, SweepstakeStatus } from "@/lib/types";

type StatusFilter = "all" | SweepstakeStatus;
type RiskFilter = "all" | "low" | "medium" | "high";
type SortMode = "deadline" | "prize" | "risk" | "eligibility" | "newest";

export default function SweepstakesPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["sweepstakes"], queryFn: () => apiGet<Sweepstake[]>("/sweepstakes") });
  const sweepstakes = data ?? [];
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState<"all" | PrizeCategory>("all");
  const [risk, setRisk] = useState<RiskFilter>("all");
  const [sort, setSort] = useState<SortMode>("deadline");

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sweepstakes
      .filter((item) => {
        const matchesQuery =
          !normalizedQuery ||
          [item.title, item.sponsor, item.url, item.rulesUrl ?? "", item.eligibilitySummary, item.category]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery);
        const matchesStatus = status === "all" || item.status === status;
        const matchesCategory = category === "all" || item.category === category;
        const matchesRisk =
          risk === "all" ||
          (risk === "low" && item.scamScore < 45) ||
          (risk === "medium" && item.scamScore >= 45 && item.scamScore < 70) ||
          (risk === "high" && item.scamScore >= 70);
        return matchesQuery && matchesStatus && matchesCategory && matchesRisk;
      })
      .sort((a, b) => sortSweepstakes(a, b, sort));
  }, [category, query, risk, sort, status, sweepstakes]);

  const totalPrizeValue = sweepstakes.reduce((sum, item) => sum + (item.prizeRetailValue ?? 0), 0);
  const eligibleCount = sweepstakes.filter((item) => item.status === "eligible").length;
  const highRiskCount = sweepstakes.filter((item) => item.scamScore >= 70).length;
  const soonestDeadline = sweepstakes
    .filter((item) => item.endAt)
    .slice()
    .sort((a, b) => new Date(a.endAt ?? 0).getTime() - new Date(b.endAt ?? 0).getTime())[0];

  const hasFilters = query || status !== "all" || category !== "all" || risk !== "all" || sort !== "deadline";

  return (
    <AppShell>
      <PageHeader
        title="Sweepstakes Database"
        kicker={`${sweepstakes.length} tracked records`}
        description="Search, sort, and triage every saved sweepstakes record by prize value, deadline urgency, eligibility, category, and risk before manual entry."
      >
        <Badge tone="ok">Manual submit only</Badge>
        <Badge tone="warn">Risk-ranked</Badge>
      </PageHeader>

      {isLoading ? <LoadingState title="Loading sweepstakes database" /> : null}
      {isError ? <ErrorNotice title="Unable to load sweepstakes" body="The API request failed. Confirm the API server is running." /> : null}

      {data ? (
        <div className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Tracked" value={sweepstakes.length} sublabel="saved records" icon={<Database size={17} aria-hidden="true" />} />
            <MetricCard label="Eligible" value={eligibleCount} sublabel="ready after review" tone="ok" />
            <MetricCard label="High Risk" value={highRiskCount} sublabel="70+ risk score" tone={highRiskCount ? "danger" : "default"} />
            <MetricCard label="Prize Value" value={formatCurrency(totalPrizeValue)} sublabel={soonestDeadline ? `Soonest: ${soonestDeadline.title}` : "no deadlines yet"} icon={<Trophy size={17} aria-hidden="true" />} />
          </div>

          <Panel>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-accent">
                  <SlidersHorizontal size={15} aria-hidden="true" />
                  Search and filter
                </div>
                <h2 className="text-balance text-xl font-semibold text-foreground">Find the safest next opportunity</h2>
                <p className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-muted">
                  Combine sponsor, category, risk, and deadline filters without changing any entry state.
                </p>
              </div>
              {hasFilters ? (
                <button
                  type="button"
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line bg-panel-strong px-3 text-sm font-medium text-foreground hover:border-accent/50"
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                    setCategory("all");
                    setRisk("all");
                    setSort("deadline");
                  }}
                >
                  <X size={16} aria-hidden="true" />
                  Reset
                </button>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[1.2fr_repeat(4,minmax(0,0.7fr))]">
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                <span>Search</span>
                <span className="flex min-h-10 items-center gap-2 rounded-md border border-line bg-panel-strong px-3">
                  <Search size={16} className="text-muted" aria-hidden="true" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
                    value={query}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                    placeholder="Sponsor, prize, URL, notes"
                  />
                </span>
              </label>
              <FilterSelect label="Status" value={status} onChange={(value) => setStatus(value as StatusFilter)}>
                <option value="all">All statuses</option>
                {statusOptions(sweepstakes).map((value) => (
                  <option key={value} value={value}>
                    {titleCase(value)}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect label="Category" value={category} onChange={(value) => setCategory(value as "all" | PrizeCategory)}>
                <option value="all">All categories</option>
                {PRIZE_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {categoryLabel(value)}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect label="Risk" value={risk} onChange={(value) => setRisk(value as RiskFilter)}>
                <option value="all">All risk levels</option>
                <option value="low">Low risk</option>
                <option value="medium">Medium risk</option>
                <option value="high">High risk</option>
              </FilterSelect>
              <FilterSelect label="Sort" value={sort} onChange={(value) => setSort(value as SortMode)}>
                <option value="deadline">Soonest deadline</option>
                <option value="prize">Highest prize</option>
                <option value="eligibility">Best eligibility</option>
                <option value="risk">Lowest risk</option>
                <option value="newest">Newest saved</option>
              </FilterSelect>
            </div>
          </Panel>

          <Panel>
            <SectionHeader
              title="Tracked Sweepstakes"
              eyebrow="Risk, eligibility, deadline, and frequency"
              action={
                <Badge>
                  <Filter size={13} aria-hidden="true" />
                  {filtered.length} shown
                </Badge>
              }
            />
            <div className="grid gap-4">
              {filtered.length ? (
                filtered.map((item) => <SweepstakesCard key={item.id} item={item} />)
              ) : (
                <EmptyState
                  title={sweepstakes.length ? "No records match these filters" : "No sweepstakes discovered"}
                  body={
                    sweepstakes.length
                      ? "Clear a filter or search for another sponsor, prize category, deadline, or risk band."
                      : "Run a discovery job to collect candidates, then extract rules before entering anything manually."
                  }
                  action={<Database size={18} className="text-accent" aria-hidden="true" />}
                />
              )}
            </div>
          </Panel>
        </div>
      ) : null}
    </AppShell>
  );
}

function FilterSelect(props: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-foreground">
      <span>{props.label}</span>
      <select
        className="h-10 w-full rounded-md border border-line bg-panel-strong px-3 text-sm text-foreground outline-none focus:border-accent"
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      >
        {props.children}
      </select>
    </label>
  );
}

function statusOptions(items: Sweepstake[]) {
  return Array.from(new Set(items.map((item) => item.status))).sort();
}

function sortSweepstakes(a: Sweepstake, b: Sweepstake, sort: SortMode) {
  if (sort === "prize") return (b.prizeRetailValue ?? 0) - (a.prizeRetailValue ?? 0);
  if (sort === "risk") return a.scamScore - b.scamScore;
  if (sort === "eligibility") return b.eligibilityScore - a.eligibilityScore;
  if (sort === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  return dateOrMax(a.endAt) - dateOrMax(b.endAt);
}

function dateOrMax(value: string | null) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}
