import { ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { SweepstakeCard } from "@/components/SweepstakeCard";
import { EmptyState, ErrorNotice, LoadingState, PageHeader, Screen, SectionHeader } from "@/components/ui";
import { apiGet } from "@/lib/api";
import type { Sweepstake } from "@/lib/types";

export default function SweepstakesScreen() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["sweepstakes"], queryFn: () => apiGet<Sweepstake[]>("/sweepstakes") });
  const sweepstakes = data ?? [];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <PageHeader title="Sweepstakes Database" kicker={`${sweepstakes.length} tracked records`} />
        <View style={{ padding: 16, gap: 16 }}>
          <SectionHeader title="Tracked Sweepstakes" eyebrow="Risk, eligibility, deadline, and frequency" />
          {isLoading ? <LoadingState /> : null}
          {isError ? <ErrorNotice title="Unable to load sweepstakes" body="The API request failed. Confirm the API server is running." /> : null}
          {data ? (
            sweepstakes.length ? (
              <View style={{ gap: 12 }}>
                {sweepstakes.map((item) => (
                  <SweepstakeCard key={item.id} item={item} />
                ))}
              </View>
            ) : (
              <EmptyState title="No sweepstakes discovered" body="Run a discovery job to collect candidates, then extract rules before entering anything manually." />
            )
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
