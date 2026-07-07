import { Alert, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ListChecks } from "lucide-react-native";
import { ActionButton, Badge, Card, EmptyState, ErrorNotice, LoadingState, PageHeader, Screen, SectionHeader, styles } from "@/components/ui";
import { colors } from "@/constants/colors";
import { apiGet, useApiMutation } from "@/lib/api";
import { titleCase } from "@/lib/format";
import type { AssistantTask } from "@/lib/types";

export default function QueueScreen() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["queue"], queryFn: () => apiGet<AssistantTask[]>("/queue") });
  const tasks = data ?? [];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <PageHeader title="Form Assistant Queue" kicker="Human-approved staging, never auto-submit" />
        <View style={{ padding: 16, gap: 16 }}>
          <SectionHeader title="Ready for Review" eyebrow="Manual approval workflow" />
          {isLoading ? <LoadingState /> : null}
          {isError ? <ErrorNotice title="Unable to load queue" body="The API request failed. Confirm the API server is running." /> : null}
          {data ? (
            tasks.length ? (
              <View style={{ gap: 12 }}>
                {tasks.map((task) => (
                  <QueueTaskCard key={task.id} task={task} />
                ))}
              </View>
            ) : (
              <EmptyState title="Queue is empty" body="Eligible sweepstakes that can be staged for manual review will appear here." />
            )
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function QueueTaskCard({ task }: { task: AssistantTask }) {
  const approve = useApiMutation("/assistant/approve");
  const record = useApiMutation("/entries/record");
  return (
    <Card>
      <View style={styles.wrap}>
        <Text style={styles.cardTitle}>{task.sweepstakeTitle}</Text>
        <Badge tone={task.status === "approved" ? "ok" : task.status === "blocked" ? "danger" : "warn"}>{titleCase(task.status)}</Badge>
        <Badge>Priority {task.priority}</Badge>
        <Badge tone="ok">Approval required</Badge>
      </View>
      <Text style={styles.bodyText}>{task.formUrl}</Text>
      <View style={{ gap: 8 }}>
        {Object.entries(task.fields).length ? (
          Object.entries(task.fields).map(([key, value]) => (
            <Card key={key} compact>
              <Text style={styles.mutedText}>{key}</Text>
              <Text style={styles.bodyText}>{value}</Text>
            </Card>
          ))
        ) : (
          <Text style={styles.bodyText}>No fields have been staged yet.</Text>
        )}
      </View>
      <View style={styles.wrap}>
        {task.blockers.length ? task.blockers.map((blocker) => <Badge key={blocker} tone="warn">{blocker}</Badge>) : <Badge tone="ok">No active blockers</Badge>}
      </View>
      <View style={styles.wrap}>
        <ActionButton
          label="Approve"
          disabled={approve.isPending}
          icon={<CheckCircle2 color={colors.black} size={15} />}
          onPress={() => approve.mutate({ taskId: task.id })}
        />
        <ActionButton
          label="Log Manual Attempt"
          tone="secondary"
          disabled={record.isPending}
          icon={<ListChecks color={colors.text} size={15} />}
          onPress={() => {
            Alert.alert("Confirm manual submission", "Only log this after you personally submitted and reviewed the live form.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Log Attempt",
                onPress: () =>
                  record.mutate({
                    sweepstakeId: task.sweepstakeId,
                    userApproved: "on",
                    reviewConfirmed: "on",
                    notes: `Approved from assistant queue task ${task.id}`,
                  }),
              },
            ]);
          }}
        />
      </View>
    </Card>
  );
}
