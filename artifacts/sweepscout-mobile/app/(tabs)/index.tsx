import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react-native";
import { SweepstakeCard } from "@/components/SweepstakeCard";
import { ActionButton, Badge, Card, EmptyState, ErrorNotice, LoadingState, MetricCard, PageHeader, Screen, SectionHeader, styles } from "@/components/ui";
import { colors } from "@/constants/colors";
import { apiGet } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/format";
import type { AppConfig, DashboardData } from "@/lib/types";

const fallbackConfig: AppConfig = {
  mode: "sqlite",
  openaiConfigured: false,
  openaiModel: "",
  supabaseConfigured: false,
  browserHeadless: true,
  warnings: [],
};

export default function DashboardScreen() {
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: () => apiGet<DashboardData>("/dashboard") });
  const config = useQuery({ queryKey: ["config"], queryFn: () => apiGet<AppConfig>("/config") });
  const runtime = config.data ?? fallbackConfig;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <PageHeader title="Trust Dashboard" kicker="Sweepstakes compliance command center">
          <Badge tone={runtime.mode === "supabase" ? "ok" : "default"}>{runtime.mode === "supabase" ? "Supabase" : "SQLite"} trust console</Badge>
          <ActionButton
            label="Review Queue"
            icon={<ArrowRight color={colors.black} size={16} />}
            onPress={() => router.push("/queue")}
          />
        </PageHeader>

        <View style={{ padding: 16, gap: 18 }}>
          {runtime.warnings.length ? (
            <Card>
              <Text style={styles.cardTitle}>Runtime Warning</Text>
              <Text style={styles.bodyText}>{runtime.warnings[0]}</Text>
            </Card>
          ) : null}

          {dashboard.isLoading ? <LoadingState /> : null}
          {dashboard.isError ? <ErrorNotice title="Unable to load dashboard" body="The API request failed. Confirm the API server is running." /> : null}
          {dashboard.data ? <DashboardBody data={dashboard.data} /> : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function DashboardBody({ data }: { data: DashboardData }) {
  const priority = data.sweepstakes
    .slice()
    .sort((a, b) => b.scamScore - a.scamScore || new Date(a.endAt ?? 0).getTime() - new Date(b.endAt ?? 0).getTime())
    .slice(0, 4);

  return (
    <>
      <View style={styles.wrap}>
        <MetricCard label="Active" value={data.stats.activeSweepstakes} sublabel="tracked" />
        <MetricCard label="Ending Soon" value={data.stats.endingSoon} sublabel="within 7 days" />
        <MetricCard label="Queue" value={data.stats.queuedAssistantTasks} sublabel="awaiting review" />
        <MetricCard label="Entries" value={data.stats.entriesThisWeek} sublabel="this week" />
        <MetricCard label="Avg Eligibility" value={`${data.stats.averageEligibilityScore}%`} />
        <MetricCard label="High Risk" value={data.stats.highRiskCount} />
      </View>

      <View>
        <SectionHeader title="Priority Sweepstakes" eyebrow="Highest attention first" />
        <View style={{ gap: 12 }}>
          {priority.length ? (
            priority.map((item) => <SweepstakeCard key={item.id} item={item} compact />)
          ) : (
            <EmptyState title="No sweepstakes yet" body="Run discovery or add candidates to start compliance review." />
          )}
        </View>
      </View>

      <Card>
        <SectionHeader title="Compliance Locks" eyebrow="Always-on guardrails" />
        <View style={{ gap: 10 }}>
          <Text style={[styles.bodyText, { color: colors.ok }]}>Explicit approval required</Text>
          <Text style={[styles.bodyText, { color: colors.warning }]}>CAPTCHA and payment flows stay manual-only</Text>
          <Text style={styles.bodyText}>Daily entry limit {data.settings.dailyEntryLimit}</Text>
        </View>
      </Card>

      <Card>
        <SectionHeader title="Assistant Queue" eyebrow="Manual review" action={<Badge tone="warn">{data.assistantTasks.length}</Badge>} />
        <View style={{ gap: 10 }}>
          {data.assistantTasks.slice(0, 3).length ? (
            data.assistantTasks.slice(0, 3).map((task) => (
              <ActionButton
                key={task.id}
                label={`${task.sweepstakeTitle} | ${titleCase(task.status)} | ${formatDate(task.createdAt)}`}
                tone="secondary"
                onPress={() => router.push("/queue")}
              />
            ))
          ) : (
            <EmptyState title="Queue is clear" body="Eligible sweepstakes will appear here when the assistant can stage a reviewed action." />
          )}
        </View>
      </Card>
    </>
  );
}
