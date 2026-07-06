import { clsx } from "clsx";
import type { RiskFlag } from "@/lib/types";

export function PageHeader(props: { title: string; kicker?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-4 border-b border-line pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        {props.kicker ? <p className="mb-2 text-xs font-semibold uppercase text-accent">{props.kicker}</p> : null}
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{props.title}</h1>
      </div>
      {props.children ? <div className="flex flex-wrap items-center gap-2">{props.children}</div> : null}
    </div>
  );
}

export function Panel({ children, className, ...props }: React.HTMLAttributes<HTMLElement> & { children: React.ReactNode }) {
  return (
    <section {...props} className={clsx("rounded-md border border-line bg-panel p-4 shadow-sm shadow-black/10", className)}>
      {children}
    </section>
  );
}

export function MetricCard(props: { label: string; value: string | number; sublabel?: string }) {
  return (
    <div className="rounded-md border border-line bg-panel p-4 shadow-sm shadow-black/10">
      <p className="text-sm text-muted">{props.label}</p>
      <p className="mt-3 text-3xl font-semibold text-foreground">{props.value}</p>
      {props.sublabel ? <p className="mt-2 text-xs text-muted">{props.sublabel}</p> : null}
    </div>
  );
}

export function Badge(props: { children: React.ReactNode; tone?: "default" | "ok" | "warn" | "danger" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium",
        props.tone === "ok" && "bg-ok/15 text-ok",
        props.tone === "warn" && "bg-warning/15 text-warning",
        props.tone === "danger" && "bg-danger/15 text-danger",
        (!props.tone || props.tone === "default") && "bg-panel-strong text-muted",
      )}
    >
      {props.children}
    </span>
  );
}

export function ScorePill(props: { label: string; value: number; invert?: boolean }) {
  const danger = props.invert ? props.value >= 60 : props.value < 50;
  const warn = props.invert ? props.value >= 40 && props.value < 60 : props.value >= 50 && props.value < 75;
  const ok = !danger && !warn;
  return (
    <div className="min-w-28 rounded-md border border-line bg-panel-strong px-3 py-2">
      <p className="text-xs text-muted">{props.label}</p>
      <p className={clsx("text-lg font-semibold", ok && "text-ok", warn && "text-warning", danger && "text-danger")}>{props.value}</p>
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
      className={clsx(
        "inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60",
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
  return <input {...props} className={clsx("h-10 w-full rounded-md border border-line bg-[#0d1112] px-3 text-sm text-foreground outline-none transition focus:border-accent", props.className)} />;
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
