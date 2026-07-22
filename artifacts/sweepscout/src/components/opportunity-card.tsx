import { Bookmark, CalendarClock, EyeOff, ExternalLink, Gauge, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import { Link } from "wouter";
import { Badge, Panel } from "@/components/ui";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";
import { timeRemaining } from "@/lib/radar";
import type { RadarOpportunity } from "@/lib/types";

export function OpportunityCard({ item, onSave, onHide, busy }: { item: RadarOpportunity; onSave: () => void; onHide: () => void; busy?: boolean }) {
  return (
    <Panel className="group overflow-hidden border-line/80 transition hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-[var(--shadow-glow)]">
      <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={item.eligibilityStatus === "eligible" ? "ok" : item.eligibilityStatus === "ineligible" ? "danger" : "warn"}>{titleCase(item.eligibilityStatus)}</Badge>
            <Badge>{titleCase(item.entryFrequency)}</Badge>
            {item.categories.slice(0, 2).map((category) => <Badge key={category}>{titleCase(category)}</Badge>)}
          </div>
          <Link href={`/dashboard/sweepstakes/${item.id}`} className="mt-3 block text-xl font-bold text-foreground hover:text-accent sm:text-2xl">{item.title}</Link>
          <p className="mt-1 text-sm text-muted">By {item.sponsor}</p>
          <p className="mt-3 line-clamp-2 max-w-4xl text-sm leading-6 text-foreground/85">{item.summary || "Review the official promotion and rules for complete details."}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Fact icon={<Trophy size={15} />} label={item.primaryPrize ?? "Prize details pending"} value={formatCurrency(item.estimatedPrizeValue)} />
            <Fact icon={<CalendarClock size={15} />} label={timeRemaining(item.endAt)} value={formatDate(item.endAt)} />
            <Fact icon={<Gauge size={15} />} label="Entry effort" value={`${item.entryEffortScore}/100`} />
            <Fact icon={<ShieldCheck size={15} />} label="Legitimacy indicator" value={`${item.legitimacyScore}/100`} />
          </div>
        </div>
        <div className="flex min-w-36 flex-row gap-2 lg:flex-col lg:items-stretch">
          <div className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-center"><Sparkles className="mx-auto text-accent" size={17} /><p className="mt-1 text-2xl font-bold text-foreground">{item.matchScore}</p><p className="text-[11px] uppercase tracking-wide text-muted">Match</p></div>
          <button disabled={busy} type="button" onClick={onSave} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-line bg-panel-strong px-3 text-sm hover:border-accent/50 disabled:opacity-50"><Bookmark size={15} fill={item.saved ? "currentColor" : "none"} />{item.saved ? "Saved" : "Save"}</button>
          <button disabled={busy} type="button" onClick={onHide} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm text-muted hover:text-foreground disabled:opacity-50"><EyeOff size={15} />Hide</button>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line/70 pt-4">
        <Link href={`/dashboard/sweepstakes/${item.id}`} className="rounded-md bg-reward px-4 py-2 text-sm font-bold text-[#111827]">View details</Link>
        <span className="text-xs text-muted">Source confidence {item.sourceConfidenceScore}/100 · {item.popularity} saves</span>
        <a href={item.officialUrl} target="_blank" rel="noopener noreferrer external" className="ml-auto inline-flex items-center gap-1 text-sm text-accent">Official sweepstakes <ExternalLink size={14} /></a>
      </div>
    </Panel>
  );
}
function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="rounded-md border border-line/70 bg-panel-strong/70 p-3"><p className="flex items-center gap-2 text-xs text-muted">{icon}{label}</p><p className="mt-1 truncate text-sm font-semibold text-foreground">{value}</p></div>; }
