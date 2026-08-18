import { useEffect, useMemo, useRef, useState } from "react";
import { Command, LogOut, Menu, Search, X, Home, Radar, FolderHeart, CalendarCheck2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { Link, useLocation } from "wouter";
import { NavLink } from "@/components/nav-link";
import { TermsWarningModal } from "@/components/terms-warning-modal";
import { apiGet } from "@/lib/api";
import type { AppConfig } from "@/lib/types";
import { useAuth } from "@/lib/auth";

const nav = [
  { href: "/dashboard", label: "Flight Deck", description: "Today's plan", icon: "home", group: "Flight" },
  { href: "/dashboard/sweepstakes", label: "Opportunity Radar", description: "Sweepstakes and giveaway feed", icon: "radar", group: "Flight" },
  { href: "/dashboard/daily", label: "Flight Plan", description: "Daily schedule and reminders", icon: "calendar", group: "Flight" },
  { href: "/dashboard/assistant", label: "Co-Pilot", description: "AI research assistant", icon: "assistant", group: "Flight" },
  { href: "/dashboard/hangar", label: "Hangar", description: "Saved and prioritized missions", icon: "hangar", group: "Organize" },
  { href: "/dashboard/entries", label: "Mission Log", description: "Entered and skipped tracking", icon: "clipboard", group: "Organize" },
  { href: "/dashboard/alerts", label: "Alerts & Scans", description: "Digests, reminders, and custom monitoring", icon: "alerts", group: "Operations" },
  { href: "/dashboard/discovery", label: "Source Radar", description: "Approved discovery jobs", icon: "database", group: "Operations" },
  { href: "/dashboard/imports", label: "Manual Intake", description: "Administrator imports", icon: "import", group: "Operations" },
  { href: "/dashboard/spam-sources", label: "Risk Signals", description: "Source and inbox risk", icon: "mail", group: "Operations" },
  { href: "/dashboard/reports", label: "Reports", description: "Evidence and research", icon: "reports", group: "Operations" },
  { href: "/dashboard/billing", label: "Pilot Credits & Billing", description: "Plan and usage", icon: "gauge", group: "Account" },
  { href: "/dashboard/settings", label: "Settings", description: "Preferences", icon: "settings", group: "Account" },
  { href: "/dashboard/admin", label: "Platform Admin", description: "Operator controls", icon: "shield", group: "Account" },
] as const;

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
    <div className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[19rem_1fr]">
      <AppSidebar config={config} />
      <MobileNav config={config} />
      <CommandMenu />
      <main className="mx-auto min-w-0 w-full max-w-[1540px] px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:py-7">{children}</main>
      <TermsWarningModal />
      <Toaster
        theme="dark"
        toastOptions={{
          style: {
            background: "hsl(var(--panel))",
            border: "1px solid hsl(var(--line))",
            color: "hsl(var(--foreground))",
          },
        }}
      />
    </div>
  );
}

export function AppSidebar({ config }: { config: AppConfig }) {
  const { session, logout } = useAuth();
  const visibleNav = nav.filter((item) => item.href !== "/dashboard/admin" || session?.user.platformRole !== "user");
  return (
    <aside className="hidden border-r border-line/80 bg-navigation/92 px-4 py-5 backdrop-blur-xl lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
      <BrandLockup config={config} />
      <div className="mt-5 rounded-lg border border-line/80 bg-panel/70 p-2">
        <button
          type="button"
          className="flex h-10 w-full items-center justify-between rounded-md border border-line bg-panel-strong px-3 text-sm text-muted transition hover:border-accent/50 hover:text-foreground"
          onClick={() => window.dispatchEvent(new Event("play-pack-pilot-command-open"))}
        >
          <span className="inline-flex items-center gap-2">
            <Search size={16} aria-hidden="true" />
            Command
          </span>
          <span className="rounded border border-line px-1.5 py-0.5 text-[11px]">Ctrl K</span>
        </button>
      </div>
      <nav className="mt-4 grid gap-5 overflow-y-auto pr-1" aria-label="Primary">
        {["Flight", "Organize", "Operations", "Account"].map((groupName) => {
          const items = visibleNav.filter((item) => item.group === groupName);
          if (!items.length) return null;
          return (
            <div key={groupName}>
              <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted/80">{groupName}</h3>
              <div className="grid gap-1">
                {items.map((item) => (
                  <NavLink key={item.href} {...item} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="mt-4 flex items-center gap-3 rounded-lg border border-line bg-panel/80 p-3">
        <div className="flex size-9 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">{session?.user.displayName.slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{session?.user.displayName}</p><p className="truncate text-xs text-muted">{session?.user.email}</p></div>
        <button type="button" aria-label="Sign out" className="rounded-md p-2 text-muted hover:bg-panel-strong hover:text-foreground" onClick={() => void logout()}><LogOut size={16} /></button>
      </div>
      <div className="mt-auto rounded-lg border border-accent/20 bg-[linear-gradient(145deg,hsl(var(--accent)/0.10),hsl(var(--panel)/0.82))] p-3 text-xs leading-5 text-muted">
        <p className="font-semibold text-foreground">Flight safety</p>
        <p className="mt-1">Play Pack Pilot researches and organizes. Sponsor rules control each promotion, and every entry stays user-controlled.</p>
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
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [location, navigate] = useLocation();
  const { session, logout } = useAuth();
  const visibleNav = nav.filter((item) => item.href !== "/dashboard/admin" || session?.user.platformRole !== "user");
  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/80 bg-surface-glass px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <BrandLockup config={config} compact />
          <button ref={menuButtonRef} className="flex size-10 items-center justify-center rounded-md border border-line bg-panel text-foreground" type="button" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu size={20} aria-hidden="true" />
          </button>
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-surface-glass px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden" aria-label="Mobile primary">
        <div className="grid grid-cols-4 gap-1">
          {[
            { href: "/dashboard", label: "Deck", icon: Home },
            { href: "/dashboard/sweepstakes", label: "Radar", icon: Radar },
            { href: "/dashboard/hangar", label: "Hangar", icon: FolderHeart },
            { href: "/dashboard/daily", label: "Plan", icon: CalendarCheck2 },
          ].map((item) => {
            const active = location === item.href || (item.href !== "/dashboard" && location.startsWith(`${item.href}/`));
            const Icon = item.icon;
            return (
              <button
                key={item.href}
                type="button"
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-[10px] font-medium transition ${active ? "bg-accent/15 text-accent" : "text-muted hover:bg-panel hover:text-foreground"}`}
                onClick={() => navigate(item.href)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
      {open ? (
        <div className="fixed inset-0 z-50 bg-background/78 backdrop-blur-sm lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="ml-auto flex h-full w-[min(24rem,88vw)] flex-col border-l border-line bg-panel p-4 shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-between gap-3">
              <BrandLockup config={config} compact />
              <button ref={closeButtonRef} className="flex size-10 items-center justify-center rounded-md border border-line bg-panel-strong" type="button" onClick={() => { setOpen(false); menuButtonRef.current?.focus(); }} aria-label="Close navigation">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4 grid gap-5 overflow-y-auto">
              {["Flight", "Organize", "Operations", "Account"].map((groupName) => (
                <div key={groupName}>
                  <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted/80">{groupName}</h2>
                  <div className="grid gap-1">
                    {visibleNav.filter((item) => item.group === groupName).map((item) => (
                      <Link key={item.href} href={item.href} className="flex min-h-10 items-center rounded-md px-3 text-sm text-muted hover:bg-panel-strong hover:text-foreground" onClick={() => setOpen(false)}>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => void logout()} className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line text-sm text-muted"><LogOut size={16} /> Sign out</button>
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
    window.addEventListener("play-pack-pilot-command-open", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("play-pack-pilot-command-open", onOpen);
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
            aria-label="Search Play Pack Pilot pages"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search pages"
            className="h-11 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
          />
          <button type="button" aria-label="Close command menu" className="min-h-10 min-w-10 rounded-md text-xs text-muted hover:bg-panel hover:text-foreground" onClick={() => setOpen(false)}>
            Esc
          </button>
        </div>
        <div className="mt-3 grid max-h-80 gap-1 overflow-y-auto">
          {items.map((item) => (
            <button
              key={item.href}
              type="button"
              className="min-h-10 rounded-md px-3 py-2 text-left text-sm text-muted hover:bg-panel-strong hover:text-foreground"
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
      <img
        src="/brand/play-pack-pilot-logo-original.png"
        alt=""
        className="h-10 w-14 shrink-0 rounded-lg object-contain"
      />
      <div className="min-w-0">
        <p className="truncate font-display text-sm font-bold tracking-[0.08em] text-foreground">PLAY PACK PILOT</p>
        <p className="truncate text-[11px] text-muted">{compact ? "AI opportunity radar" : `${config.mode === "supabase" ? "Cloud" : "Local"} flight deck`}</p>
      </div>
    </div>
  );
}
