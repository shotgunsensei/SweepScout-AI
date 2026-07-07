import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Panel } from "@/components/ui";

export default function NotFound() {
  return (
    <AppShell>
      <PageHeader title="Page Not Found" kicker="404" />
      <Panel>
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 text-warning" size={20} aria-hidden />
          <div>
            <h2 className="text-lg font-semibold text-foreground">This route does not exist.</h2>
            <p className="mt-2 text-sm text-muted">
              Return to the <Link href="/dashboard" className="text-accent">Trust Dashboard</Link> to continue.
            </p>
          </div>
        </div>
      </Panel>
    </AppShell>
  );
}
