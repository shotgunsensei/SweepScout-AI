import { ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react-native";
import { ActionButton, Badge, Card, EmptyState, ErrorNotice, LoadingState, PageHeader, Screen, SectionHeader, styles } from "@/components/ui";
import { colors } from "@/constants/colors";
import { apiGet, apiUrl, useApiMutation } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/format";
import type { DiscoveryJob } from "@/lib/types";

export default function DiscoveryScreen() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["discovery"], queryFn: () => apiGet<DiscoveryJob[]>("/discovery/jobs") });
  const jobs = data ?? [];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <PageHeader title="Discovery Jobs" kicker="Search-result discovery, no form submission">
          <ActionButton label="Health" tone="secondary" onPress={() => void fetch(apiUrl("/health"))} />
        </PageHeader>
        <View style={{ padding: 16, gap: 16 }}>
          <SectionHeader title="Job Status" eyebrow="Polite discovery runs" />
          {isLoading ? <LoadingState /> : null}
          {isError ? <ErrorNotice title="Unable to load discovery jobs" body="The API request failed. Confirm the API server is running." /> : null}
          {data ? (
            jobs.length ? (
              <View style={{ gap: 12 }}>
                {jobs.map((job) => (
                  <DiscoveryCard key={job.id} job={job} />
                ))}
              </View>
            ) : (
              <EmptyState title="No discovery jobs" body="Create or seed discovery jobs to begin collecting safe candidate URLs." />
            )
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function DiscoveryCard({ job }: { job: DiscoveryJob }) {
  const runDiscovery = useApiMutation("/discovery/run");
  const notes = parseDiscoveryNotes(job.notes);
  return (
    <Card>
      <View style={[styles.row, { alignItems: "flex-start" }]}>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{job.label}</Text>
          <Text style={styles.bodyText}>{job.query}</Text>
        </View>
        <Badge tone={job.status === "completed" ? "ok" : job.status === "failed" ? "danger" : "warn"}>{titleCase(job.status)}</Badge>
      </View>
      <View style={styles.wrap}>
        <Badge tone="ok">Found {job.discoveredCount}</Badge>
        <Badge>Last {formatDate(job.lastRunAt)}</Badge>
        {notes.counters ? <Badge>Skipped {notes.counters.skipped}</Badge> : null}
        {notes.counters ? <Badge tone={notes.counters.errors ? "danger" : "default"}>Errors {notes.counters.errors}</Badge> : null}
      </View>
      <Text style={styles.bodyText}>{notes.summary}</Text>
      <View style={styles.wrap}>
        {job.seeds.map((seed) => (
          <Badge key={seed}>{seed}</Badge>
        ))}
      </View>
      <ActionButton
        label="Run"
        disabled={runDiscovery.isPending}
        icon={<Play color={colors.black} size={15} />}
        onPress={() => runDiscovery.mutate({ jobId: job.id })}
      />
    </Card>
  );
}

function parseDiscoveryNotes(notes: string) {
  try {
    const parsed = JSON.parse(notes) as { saved?: number; skipped?: number; errors?: number; guardrails?: string[] };
    return {
      summary: parsed.guardrails?.[0] ?? "Discovery run complete.",
      counters: {
        saved: parsed.saved ?? 0,
        skipped: parsed.skipped ?? 0,
        errors: parsed.errors ?? 0,
      },
    };
  } catch {
    return { summary: notes, counters: null };
  }
}
