import { ArrowRight, Bot, CheckCircle2, MailWarning, ShieldCheck, Trophy } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui";

export default function HomePage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-[#07100d]">
            <ShieldCheck size={22} aria-hidden="true" />
          </div>
          <div>
            <p className="font-semibold">SweepScout AI</p>
            <p className="text-xs text-muted">Human-approved command center</p>
          </div>
        </div>
        <Link href="/dashboard" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-[#07100d]">
          Open App <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </nav>

      <section className="relative mx-auto grid min-h-[calc(100dvh-5rem)] max-w-7xl content-center gap-10 overflow-hidden px-4 pb-10 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8">
        <div className="relative z-10">
          <div className="mb-5 flex flex-wrap gap-2">
            <Badge tone="ok">AI sweepstakes command center</Badge>
            <Badge tone="warn">Manual approval required</Badge>
          </div>
          <h1 className="max-w-4xl text-balance text-5xl font-semibold leading-[1.02] text-foreground sm:text-6xl lg:text-7xl">
            Discover. Verify. Track. Enter safely.
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-muted">
            SweepScout AI organizes sweepstakes discovery, rules extraction, inbox alerts, risk scoring, and daily entry workflows while keeping the user in control of every submission.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-5 text-sm font-semibold text-[#07100d]">
              Review Dashboard <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link href="/dashboard/assistant" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line bg-panel px-5 text-sm font-semibold text-foreground hover:border-accent/50">
              Ask Assistant <Bot size={16} aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-8 grid gap-3 text-sm text-muted sm:grid-cols-2">
            <SafetyLine icon={<CheckCircle2 size={16} aria-hidden="true" />} text="No auto-submit or CAPTCHA bypass" />
            <SafetyLine icon={<ShieldCheck size={16} aria-hidden="true" />} text="No payment, banking, or SSN storage" />
            <SafetyLine icon={<MailWarning size={16} aria-hidden="true" />} text="Winner and claim links held for review" />
            <SafetyLine icon={<Trophy size={16} aria-hidden="true" />} text="Opportunity ranked by value and fit" />
          </div>
        </div>

        <div className="relative min-h-[32rem] overflow-hidden rounded-xl border border-line bg-panel shadow-[var(--shadow-soft)]">
          <img src="/opengraph.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-[0.18]" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(8,13,16,0.25),rgba(8,13,16,0.92))]" />
          <div className="relative z-10 grid h-full content-end gap-4 p-5 sm:p-8">
            <div className="grid gap-3 sm:grid-cols-3">
              <DashboardTile label="Eligible Today" value="18" tone="ok" />
              <DashboardTile label="Winner Alerts" value="3" tone="warn" />
              <DashboardTile label="Risk Flags" value="6" tone="danger" />
            </div>
            <div className="rounded-lg border border-line bg-surface-glass p-4 backdrop-blur">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="ok">Best today</Badge>
                <Badge>Cash</Badge>
                <Badge>Daily</Badge>
              </div>
              <h2 className="mt-3 text-balance text-2xl font-semibold">High-value queue cockpit</h2>
              <p className="mt-2 text-pretty text-sm leading-6 text-muted">
                Entry queue, assistant reasoning, inbox alerts, and compliance history in one operating surface.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function SafetyLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-line bg-panel/72 px-3 py-2">
      <span className="text-accent">{icon}</span>
      {text}
    </div>
  );
}

function DashboardTile({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" | "danger" }) {
  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warning" : "text-danger";
  return (
    <div className="rounded-lg border border-line bg-surface-glass p-4 backdrop-blur">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
