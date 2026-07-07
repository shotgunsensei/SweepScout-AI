import { Database } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, SectionHeader } from "@/components/dashboard-kit";
import { PageHeader } from "@/components/ui";
import { SweepstakeCard } from "@/components/sweepstakes-card";
import { getStore } from "@/lib/storage/store";

export const dynamic = "force-dynamic";

export default async function DashboardSweepstakesPage() {
  const store = await getStore();
  const sweepstakes = await store.listSweepstakes();

  return (
    <AppShell>
      <PageHeader title="Sweepstakes Database" kicker={`${sweepstakes.length} tracked records`} />
      <SectionHeader title="Tracked Sweepstakes" eyebrow="Risk, eligibility, deadline, and frequency" />
      <div className="grid gap-4">
        {sweepstakes.length ? (
          sweepstakes.map((item) => <SweepstakeCard key={item.id} item={item} />)
        ) : (
          <EmptyState
            title="No sweepstakes discovered"
            body="Run a discovery job to collect candidates, then extract rules before entering anything manually."
            action={<Database size={18} className="text-accent" aria-hidden />}
          />
        )}
      </div>
    </AppShell>
  );
}
