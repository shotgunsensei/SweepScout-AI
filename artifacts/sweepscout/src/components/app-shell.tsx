import { useEffect, useMemo, useState } from "react";
import { Command, Menu, Search, ShieldCheck, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { Link, useLocation } from "wouter";
import { NavLink, type NavIconKey } from "@/components/nav-link";
import { TermsWarningModal } from "@/components/terms-warning-modal";
import { apiGet } from "@/lib/api";
import type { AppConfig } from "@/lib/types";

const nav: Array<{ href: string; label: string; icon: NavIconKey }> = [
  { href: "/dashboard", label: "Dashboard", icon: "home" },
  { href: "/dashboard/sweepstakes", label: "Database", icon: "database" },
  { href: "/dashboard/discovery", label: "Discovery", icon: "radar" },
  { href: "/dashboard/imports", label: "Imports", icon: "import" },
  { href: "/dashboard/assistant", label: "AI Assistant", icon: "assistant" },
  { href: "/dashboard/daily", label: "Daily Workflow", icon: "calendar" },
  { href: "/dashboard/mobile", label: "Mobile PWA", icon: "mobile" },
  { href: "/dashboard/queue", label: "Queue", icon: "list" },
  { href: "/dashboard/entries", label: "Entries", icon: "clipboard" },
  { href: "/dashboard/roi", label: "Prize ROI", icon: "roi" },
  { href: "/dashboard/reports", label: "Reports", icon: "reports" },
  { href: "/dashboard/spam-sources", label: "Spam Sources", icon: "mail" },
  { href: "/scoring", label: "Scoring", icon: "gauge" },
  { href: "/dashboard/settings", label: "Settings", icon: "settings" },
  { href: "/dashboard/admin", label: "Admin", icon: "shield" },
];

const fallbackConfig: AppConfig = {
  mode: "sqlite",
  openaiConfigured: false,
  openaiModel: "",
  supabaseConfigured: false,
  inboxConfigured: false,
  inboxProvider: "gmail",
  inboxEmail: "",
  browserHeadless: true,
  warnings: [],
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data } = useQuery({ queryKey: ["config"], queryFn: () => apiGet<AppConfig>("/config") });
  const config = data ?? fallbackConfig;
  return (
    <div className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[18.5rem_1fr]">
      <AppSidebar config={config} />
      <MobileNav config={config} />
      <CommandMenu />
      <main className="mx-auto w-full max-w-[1540px] px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:py-7">{children}</main>
      <TermsWarningModal />
      <Toaster
        theme="dark"
        toastOptions={{
          style: {
            background: "var(--panel)",
            border: "1px solid var(--line)",
            color: "var(--foreground)",
          },
        }}
      />
    </div>
  );
}

export function AppSidebar({ config }: { config: AppConfig }) {
  return (
    <aside className="hidden border-r border-line/80 bg-surface-glass px-4 py-5 backdrop-blur-xl lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
      <BrandLockup config={config} />
      <div className="mt-5 rounded-lg border border-line/80 bg-panel/70 p-2">
        <button
          type="button"
          className="flex h-10 w-full items-center justify-between rounded-md border border-line bg-panel-strong px-3 text-sm text-muted transition hover:border-accent/50 hover:text-foreground"
          onClick={() => window.dispatchEvent(new Event("sweepscout-command-open"))}
        >
          <span className="inline-flex items-center gap-2">
            <Search size={16} aria-hidden="true" />
            Command
          </span>
          <span className="rounded border border-line px-1.5 py-0.5 text-[11px]">Ctrl K</span>
        </button>
      </div>
      <nav className="mt-4 grid gap-1 overflow-y-auto pr-1" aria-label="Primary">
        {nav.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
      </nav>
      <div className="mt-auto rounded-lg border border-accent/20 bg-[linear-gradient(145deg,rgba(79,224,176,0.10),rgba(17,24,27,0.82))] p-3 text-xs leading-5 text-muted">
        <p className="font-semibold text-foreground">Safety posture</p>
        <p className="mt-1">Manual approval is locked on. CAPTCHA, payment, SSN, banking, and final submit stay user-controlled.</p>
      </div>
      {config.warnings.length ? (
        <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs leading-5 text-warning">
          {config.warnings[0]}
        </div>
      ) : null}
    </aside>
  );
}

export function MobileNav({ config }: { config: AppConfig }) {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const primary = nav.filter((item) => ["/dashboard", "/dashboard/daily", "/dashboard/assistant", "/dashboard/sweepstakes"].includes(item.href));
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/80 bg-surface-glass px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <BrandLockup config={config} compact />
          <button className="flex size-10 items-center justify-center rounded-md border border-line bg-panel text-foreground" type="button" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu size={20} aria-hidden="true" />
          </button>
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-surface-glass px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden" aria-label="Mobile primary">
        <div className="grid grid-cols-4 gap-1">
          {primary.map((item) => (
            <button
              key={item.href}
              type="button"
              className="min-h-12 rounded-md px-2 text-xs font-medium text-muted transition hover:bg-panel hover:text-foreground"
              onClick={() => navigate(item.href)}
            >
              {item.label.replace(" Workflow", "").replace("AI ", "")}
            </button>
          ))}
        </div>
      </nav>
      {open ? (
        <div className="fixed inset-0 z-50 bg-background/78 backdrop-blur-sm lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="ml-auto flex h-full w-[min(24rem,88vw)] flex-col border-l border-line bg-panel p-4 shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-between gap-3">
              <BrandLockup config={config} compact />
              <button className="flex size-10 items-center justify-center rounded-md border border-line bg-panel-strong" type="button" onClick={() => setOpen(false)} aria-label="Close navigation">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4 grid gap-1 overflow-y-auto">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className="rounded-md px-3 py-2 text-sm text-muted hover:bg-panel-strong hover:text-foreground" onClick={() => setOpen(false)}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, navigate] = useLocation();
  const items = useMemo(
    () => nav.filter((item) => `${item.label} ${item.href}`.toLowerCase().includes(query.toLowerCase())),
    [query],
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("sweepscout-command-open", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("sweepscout-command-open", onOpen);
    };
  }, []);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-start bg-background/72 px-4 pt-20 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Command menu">
      <div className="mx-auto w-full max-w-xl rounded-xl border border-line bg-panel p-3 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-panel-strong px-3">
          <Command size={17} className="text-accent" aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search pages"
            className="h-11 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
          />
          <button type="button" className="text-xs text-muted" onClick={() => setOpen(false)}>
            Esc
          </button>
        </div>
        <div className="mt-3 grid max-h-80 gap-1 overflow-y-auto">
          {items.map((item) => (
            <button
              key={item.href}
              type="button"
              className="rounded-md px-3 py-2 text-left text-sm text-muted hover:bg-panel-strong hover:text-foreground"
              onClick={() => {
                navigate(item.href);
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
          {!items.length ? <p className="px-3 py-6 text-center text-sm text-muted">No matching page.</p> : null}
        </div>
      </div>
    </div>
  );
}

function BrandLockup({ config, compact = false }: { config: AppConfig; compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-[#07100d] shadow-sm">
        <ShieldCheck size={22} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold text-foreground">SweepScout AI</p>
        <p className="truncate text-xs text-muted">{compact ? "Human-approved command center" : `${config.mode === "supabase" ? "Supabase" : "SQLite"} compliance console`}</p>
      </div>
    </div>
  );
}
