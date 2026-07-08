import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { AlertTriangle, CalendarClock, CheckCircle2, Circle, DollarSign, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";
import { categoryLabel } from "@/lib/prize-categories";
import type { RiskFlag, Sweepstake } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PageHeader(props: { title: string; kicker?: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-4 border-b border-line/80 pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        {props.kicker ? <p className="mb-2 text-xs font-semibold uppercase text-accent">{props.kicker}</p> : null}
        <h1 className="text-balance text-2xl font-semibold text-foreground sm:text-4xl">{props.title}</h1>
        {props.description ? <p className="mt-3 max-w-3xl text-pretty text-sm leading-6 text-muted">{props.description}</p> : null}
      </div>
      {props.children ? <div className="flex flex-wrap items-center gap-2">{props.children}</div> : null}
    </div>
  );
}

export function Panel({ children, className, ...props }: React.HTMLAttributes<HTMLElement> & { children: React.ReactNode }) {
  return (
    <section
      {...props}
      className={cn(
        "rounded-lg border border-line/85 bg-panel/92 p-4 shadow-[var(--shadow-soft)] backdrop-blur transition-colors",
        className,
      )}
    >
      {children}
    </section>
  );
}

export const SectionPanel = Panel;

export function MetricCard(props: { label: string; value: string | number; sublabel?: string; icon?: React.ReactNode; tone?: "default" | "ok" | "warn" | "danger" }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-line/85 bg-panel/92 p-4 shadow-sm shadow-black/10 transition duration-150 hover:-translate-y-0.5 hover:border-accent/45",
        props.tone === "ok" && "bg-ok/5",
        props.tone === "warn" && "bg-warning/5",
        props.tone === "danger" && "bg-danger/5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted">{props.label}</p>
        {props.icon ? <span className="text-accent">{props.icon}</span> : null}
      </div>
      <p className="mt-3 text-3xl font-semibold text-foreground tabular-nums">{props.value}</p>
      {props.sublabel ? <p className="mt-2 text-xs text-muted">{props.sublabel}</p> : null}
    </div>
  );
}

export function Badge(props: { children: React.ReactNode; tone?: "default" | "ok" | "warn" | "danger" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
        props.tone === "ok" && "border-ok/20 bg-ok/12 text-ok",
        props.tone === "warn" && "border-warning/25 bg-warning/12 text-warning",
        props.tone === "danger" && "border-danger/25 bg-danger/12 text-danger",
        (!props.tone || props.tone === "default") && "border-line bg-panel-strong text-muted",
      )}
    >
      {props.children}
    </span>
  );
}

export function RiskBadge({ value }: { value: number }) {
  const tone = value >= 70 ? "danger" : value >= 45 ? "warn" : "ok";
  return (
    <Badge tone={tone}>
      <ShieldAlert size={13} aria-hidden="true" />
      Risk {value}
    </Badge>
  );
}

export function EligibilityBadge({ value, status }: { value: number; status?: string }) {
  const tone = value >= 75 ? "ok" : value >= 50 ? "warn" : "danger";
  return (
    <Badge tone={tone}>
      <ShieldCheck size={13} aria-hidden="true" />
      {status ? titleCase(status) : `Eligibility ${value}`}
    </Badge>
  );
}

export function DeadlineBadge({ value }: { value: string | null }) {
  const delta = value ? new Date(value).getTime() - Date.now() : Number.NaN;
  if (!value || !Number.isFinite(delta)) {
    return (
      <Badge>
        <CalendarClock size={13} aria-hidden="true" />
        Deadline unknown
      </Badge>
    );
  }
  if (delta < 0) return <Badge tone="danger">Expired</Badge>;
  const days = Math.ceil(delta / (24 * 60 * 60 * 1000));
  if (days <= 2) return <Badge tone="danger">{days}d left</Badge>;
  if (days <= 7) return <Badge tone="warn">{days}d left</Badge>;
  return <Badge>Ends {formatDate(value)}</Badge>;
}

export function PrizeCard({ item }: { item: Sweepstake }) {
  return (
    <div className="rounded-lg border border-line/85 bg-[linear-gradient(145deg,rgba(79,224,176,0.12),rgba(24,34,37,0.88))] p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-accent">
        <DollarSign size={15} aria-hidden="true" />
        Prize Value
      </div>
      <p className="mt-3 text-3xl font-semibold text-foreground tabular-nums">{formatCurrency(item.prizeRetailValue)}</p>
      <p className="mt-2 text-sm text-muted">{categoryLabel(item.category)} | {item.sponsor}</p>
    </div>
  );
}

export function ScorePill(props: { label: string; value: number; invert?: boolean }) {
  const danger = props.invert ? props.value >= 60 : props.value < 50;
  const warn = props.invert ? props.value >= 40 && props.value < 60 : props.value >= 50 && props.value < 75;
  const ok = !danger && !warn;
  return (
    <div className="min-w-28 rounded-lg border border-line bg-panel-strong px-3 py-2">
      <p className="text-xs text-muted">{props.label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", ok && "text-ok", warn && "text-warning", danger && "text-danger")}>{props.value}</p>
    </div>
  );
}

export function RiskList({ flags }: { flags: RiskFlag[] }) {
  if (flags.length === 0) {
    return <p className="text-sm text-muted">No active risk flags.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {flags.map((flag) => (
        <Badge key={flag.code} tone={flag.severity === "high" ? "danger" : flag.severity === "medium" ? "warn" : "default"}>
          {flag.label}
        </Badge>
      ))}
    </div>
  );
}

export function SubmitButton(props: { children: React.ReactNode; tone?: "primary" | "secondary" | "danger"; disabled?: boolean }) {
  return (
    <button
      className={cn(
        "inline-flex min-h-10 items-center justify-center rounded-md px-3 text-sm font-medium transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60",
        props.tone === "danger" && "bg-danger/15 text-danger",
        props.tone === "secondary" && "border border-line bg-panel-strong text-foreground",
        (!props.tone || props.tone === "primary") && "bg-accent text-[#08110e]",
      )}
      type="submit"
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("h-10 w-full rounded-md border border-line bg-panel-strong px-3 text-sm text-foreground outline-none transition placeholder:text-muted/70 focus:border-accent", props.className)} />;
}

export function Checkbox(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <label className="flex items-center gap-2 text-sm text-foreground">
      <input {...rest} type="checkbox" className="h-4 w-4 accent-accent" />
      {label}
    </label>
  );
}

export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-lg border border-line bg-panel p-4">
          <div className="h-4 w-2/5 animate-pulse rounded bg-panel-strong" />
          <div className="mt-4 h-8 w-1/4 animate-pulse rounded bg-panel-strong" />
          <div className="mt-3 h-3 w-3/4 animate-pulse rounded bg-panel-strong" />
        </div>
      ))}
    </div>
  );
}

export function ConfirmDialog(props: {
  title: string;
  body: string;
  confirmLabel: string;
  children: React.ReactNode;
  onConfirm: () => void;
  danger?: boolean;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{props.children}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-background/72" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-panel p-5 shadow-[var(--shadow-soft)]">
          <AlertDialog.Title className="text-balance text-base font-semibold text-foreground">{props.title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-pretty text-sm leading-6 text-muted">{props.body}</AlertDialog.Description>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel className="inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-panel-strong px-3 text-sm font-medium text-foreground">
              Cancel
            </AlertDialog.Cancel>
            <AlertDialog.Action
              className={cn(
                "inline-flex min-h-10 items-center justify-center rounded-md px-3 text-sm font-medium",
                props.danger ? "bg-danger/15 text-danger" : "bg-accent text-[#08110e]",
              )}
              onClick={props.onConfirm}
            >
              {props.confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export function StatusTimeline({ items }: { items: Array<{ label: string; detail?: string; tone?: "ok" | "warn" | "danger" | "default" }> }) {
  return (
    <ol className="grid gap-3">
      {items.map((item, index) => {
        const Icon = item.tone === "ok" ? CheckCircle2 : item.tone === "warn" || item.tone === "danger" ? AlertTriangle : Circle;
        return (
          <li key={`${item.label}-${index}`} className="flex gap-3">
            <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border", item.tone === "ok" && "border-ok/30 bg-ok/10 text-ok", item.tone === "warn" && "border-warning/30 bg-warning/10 text-warning", item.tone === "danger" && "border-danger/30 bg-danger/10 text-danger", (!item.tone || item.tone === "default") && "border-line bg-panel-strong text-muted")}>
              <Icon size={14} aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-medium text-foreground">{item.label}</span>
              {item.detail ? <span className="mt-1 block text-xs leading-5 text-muted">{item.detail}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function LoadingSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted">
      <Loader2 className="animate-spin text-accent" size={16} aria-hidden="true" />
      {label}
    </span>
  );
}
