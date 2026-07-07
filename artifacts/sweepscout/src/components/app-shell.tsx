import { ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, type NavIconKey } from "@/components/nav-link";
import { TermsWarningModal } from "@/components/terms-warning-modal";
import { apiGet } from "@/lib/api";
import type { AppConfig } from "@/lib/types";

const nav: Array<{ href: string; label: string; icon: NavIconKey }> = [
  { href: "/dashboard", label: "Dashboard", icon: "home" },
  { href: "/dashboard/sweepstakes", label: "Database", icon: "database" },
  { href: "/dashboard/discovery", label: "Discovery", icon: "radar" },
  { href: "/dashboard/imports", label: "Imports", icon: "import" },
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
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[17.5rem_1fr]">
      <aside className="border-b border-line bg-[#0c1011]/95 px-4 py-4 backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 lg:mb-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-[#07100d] shadow-sm">
            <ShieldCheck size={22} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">SweepScout AI</p>
            <p className="text-xs text-muted">{config.mode === "supabase" ? "Supabase" : "SQLite"} trust console</p>
          </div>
        </div>
        <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:mt-0 lg:grid lg:grid-cols-1 lg:overflow-visible lg:pb-0">
          {nav.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>
        <div className="mt-5 hidden rounded-md border border-line bg-panel p-3 text-xs leading-5 text-muted lg:block">
          <p className="font-semibold text-foreground">Safety posture</p>
          <p className="mt-1">Manual approval is locked on. CAPTCHA and payment flows stay manual-only.</p>
        </div>
        {config.warnings.length ? (
          <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs leading-5 text-warning">
            {config.warnings[0]}
          </div>
        ) : null}
      </aside>
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      <TermsWarningModal />
    </div>
  );
}
