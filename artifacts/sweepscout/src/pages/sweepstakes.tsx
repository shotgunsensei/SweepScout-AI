import { Database } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorNotice, LoadingState, SectionHeader } from "@/components/dashboard-kit";
import { PageHeader } from "@/components/ui";
import { SweepstakeCard } from "@/components/sweepstakes-card";
import { apiGet } from "@/lib/api";
import type { Sweepstake } from "@/lib/types";

export default function SweepstakesPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["sweepstakes"], queryFn: () => apiGet<Sweepstake[]>("/sweepstakes") });
  const sweepstakes = data ?? [];

  return (
    <AppShell>
      <PageHeader title="Sweepstakes Database" kicker={`${sweepstakes.length} tracked records`} />
      <SectionHeader title="Tracked Sweepstakes" eyebrow="Risk, eligibility, deadline, and frequency" />
      {isLoading ? <LoadingState /> : null}
      {isError ? <ErrorNotice title="Unable to load sweepstakes" body="The API request failed. Confirm the API server is running." /> : null}
      {data ? (
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
      ) : null}
    </AppShell>
  );
}
