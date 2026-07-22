import { CalendarDays, ExternalLink, Repeat2, ShieldAlert, ShieldCheck, TicketCheck } from "lucide-react";
import { Link } from "wouter";
import { Badge, Panel, RiskList, ScorePill } from "@/components/ui";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";
import { categoryLabel } from "@/lib/prize-categories";
import type { Sweepstake } from "@/lib/types";

export function SweepstakeCard(props: { item: Sweepstake; children?: React.ReactNode; compact?: boolean }) {
  const item = props.item;

  return (
    <Panel className="overflow-hidden transition hover:-translate-y-0.5 hover:border-accent/45">
      <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground sm:text-lg">
              <Link href={`/dashboard/sweepstakes/${item.id}`} className="hover:text-accent">
                {item.title}
              </Link>
            </h2>
            <EligibilityBadge item={item} />
            <RiskBadge item={item} />
            <DeadlineBadge item={item} />
            <EntryFrequencyBadge value={item.entryFrequency} />
          </div>
          <p className="mt-2 text-sm text-muted">
            {item.sponsor} | {formatCurrency(item.prizeRetailValue)} | {categoryLabel(item.category)}
          </p>
          {!props.compact ? (
            <p className="mt-3 max-w-4xl text-sm leading-6 text-foreground/90">{item.eligibilitySummary}</p>
          ) : null}
          {!props.compact && item.emailAlias ? (
            <p className="mt-3 break-all text-sm text-accent">Entry alias: {item.emailAlias}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge>{item.country}</Badge>
            <Badge>{item.stateEligibility.includes("ALL") ? "All eligible states" : `${item.stateEligibility.length} states`}</Badge>
            <Badge>{item.ageRequirement ? `${item.ageRequirement}+` : "Age unknown"}</Badge>
            {item.hasCaptcha ? <Badge tone="warn">CAPTCHA manual-only</Badge> : null}
            {item.purchaseRequired ? <Badge tone="danger">Purchase flagged</Badge> : null}
          </div>
          {!props.compact ? (
            <div className="mt-4">
              <RiskList flags={item.riskFlags} />
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <Link href={`/dashboard/sweepstakes/${item.id}`} className="inline-flex items-center gap-2 rounded-md border border-line bg-panel-strong px-3 py-1.5 text-foreground hover:border-accent/50">
              Details
            </Link>
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-md bg-reward px-3 py-1.5 font-semibold text-[#111827]">
              Visit Official Sweepstakes <ExternalLink size={15} aria-hidden="true" />
            </a>
            {item.rulesUrl ? (
              <a href={item.rulesUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-muted hover:text-foreground">
                Official rules <ExternalLink size={15} aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2 xl:justify-end">
          <ScorePill label="Eligible" value={item.eligibilityScore} />
          <ScorePill label="Risk" value={item.scamScore} invert />
          {props.children}
        </div>
      </div>
    </Panel>
  );
}

export const SweepstakesCard = SweepstakeCard;

export function EligibilityBadge({ item }: { item: Sweepstake }) {
  if (item.status === "eligible") {
    return (
      <Badge tone="ok">
        <ShieldCheck className="mr-1" size={13} aria-hidden />
        Eligible
      </Badge>
    );
  }
  if (item.status === "ineligible" || item.status === "expired" || item.status === "rejected") {
    return (
      <Badge tone="danger">
        <ShieldAlert className="mr-1" size={13} aria-hidden />
        {titleCase(item.status)}
      </Badge>
    );
  }
  if (item.status === "suspicious" || item.status === "needs_review") {
    return (
      <Badge tone="warn">
        <ShieldAlert className="mr-1" size={13} aria-hidden />
        Review
      </Badge>
    );
  }
  return (
    <Badge>
      <TicketCheck className="mr-1" size={13} aria-hidden />
      {titleCase(item.status)}
    </Badge>
  );
}

export function RiskBadge({ item }: { item: Sweepstake }) {
  if (item.scamScore >= 70) return <Badge tone="danger">Risk {item.scamScore}</Badge>;
  if (item.scamScore >= 45) return <Badge tone="warn">Risk {item.scamScore}</Badge>;
  return <Badge tone="ok">Risk {item.scamScore}</Badge>;
}

export function DeadlineBadge({ item }: { item: Sweepstake }) {
  const days = daysUntil(item.endAt);
  if (days === null) {
    return (
      <Badge>
        <CalendarDays className="mr-1" size={13} aria-hidden />
        Deadline unknown
      </Badge>
    );
  }
  if (days < 0) {
    return <Badge tone="danger">Expired</Badge>;
  }
  if (days <= 7) {
    return <Badge tone="warn">Ends in {days}d</Badge>;
  }
  return <Badge>Ends {formatDate(item.endAt)}</Badge>;
}

export function EntryFrequencyBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone = normalized.includes("daily") ? "ok" : normalized.includes("unknown") ? "warn" : "default";
  return (
    <Badge tone={tone}>
      <Repeat2 className="mr-1" size={13} aria-hidden />
      {value}
    </Badge>
  );
}

function daysUntil(value: string | null) {
  if (!value) return null;
  const end = new Date(value).getTime();
  if (!Number.isFinite(end)) return null;
  return Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000));
}
