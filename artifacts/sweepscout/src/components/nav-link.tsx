import { clsx } from "clsx";
import {
  ClipboardCheck,
  Database,
  Gauge,
  Home,
  ListChecks,
  Radar,
  Settings,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { Link, useLocation } from "wouter";

const icons = {
  clipboard: ClipboardCheck,
  database: Database,
  gauge: Gauge,
  home: Home,
  list: ListChecks,
  radar: Radar,
  settings: Settings,
  shield: ShieldAlert,
} satisfies Record<string, LucideIcon>;

export type NavIconKey = keyof typeof icons;

export function NavLink(props: { href: string; label: string; icon: NavIconKey }) {
  const [pathname] = useLocation();
  const active = pathname === props.href || (props.href !== "/dashboard" && pathname.startsWith(`${props.href}/`));
  const Icon = icons[props.icon];

  return (
    <Link
      href={props.href}
      className={clsx(
        "flex h-10 min-w-0 items-center gap-2 rounded-md px-3 text-sm transition",
        active ? "bg-panel-strong text-foreground shadow-sm" : "text-muted hover:bg-panel hover:text-foreground",
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={17} aria-hidden="true" />
      <span className="truncate">{props.label}</span>
    </Link>
  );
}
