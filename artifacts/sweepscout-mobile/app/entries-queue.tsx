import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Wand2 } from "lucide-react-native";
import { ActionButton, Badge, Card, ErrorNotice, LoadingState, PageHeader, Screen, styles, openExternal } from "@/components/ui";
import { colors } from "@/constants/colors";
import { apiGet, useApiMutation } from "@/lib/api";
import { titleCase } from "@/lib/format";
import type { AssistantTask, Sweepstake } from "@/lib/types";

type PrefillQueueResponse = { tasks: AssistantTask[]; sweepstakes: Sweepstake[] };

export default function EntryPrefillQueueScreen() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["prefill-queue"], queryFn: () => apiGet<PrefillQueueResponse>("/prefill-queue") });
  const tasks = data?.tasks ?? [];
  const sweepstakes = data?.sweepstakes ?? [];
  const taskSweepstakeIds = new Set(tasks.map((task) => task.sweepstakeId));
  const directSweepstakes = sweepstakes.filter((item) => {
    const formUrl = item.formUrl ?? item.extractedRules?.formUrl;
    return formUrl && !taskSweepstakeIds.has(item.id) && item.status !== "expired" && item.status !== "ineligible" && item.status !== "suspicious";
  });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <PageHeader title="Assisted Prefill Queue" kicker="User-approved, manual-submit only" />
        <View style={{ padding: 16, gap: 12 }}>
          {isLoading ? <LoadingState /> : null}
          {isError ? <ErrorNotice title="Unable to load prefill queue" body="The API request failed. Confirm the API server is running." /> : null}
          {data ? (
            <>
              {tasks.map((task) => (
                <Card key={task.id}>
                  <View style={styles.wrap}>
                    <Text style={styles.cardTitle}>{task.sweepstakeTitle}</Text>
                    <Badge tone={task.status === "blocked" ? "danger" : task.status === "approved" ? "ok" : "warn"}>{titleCase(task.status)}</Badge>
                    <Badge>Assistant task</Badge>
                  </View>
                  <Text style={styles.bodyText}>{task.formUrl}</Text>
                  <View style={styles.wrap}>
                    {task.blockers.map((blocker) => (
                      <Badge key={blocker} tone="warn">{blocker}</Badge>
                    ))}
                  </View>
                  <PrefillButton sweepstakeId={task.sweepstakeId} formUrl={task.formUrl} />
                </Card>
              ))}

              {directSweepstakes.map((item) => {
                const formUrl = item.formUrl ?? item.extractedRules?.formUrl ?? "";
                return (
                  <Card key={item.id}>
                    <View style={styles.wrap}>
                      <Text style={styles.cardTitle}>{item.title}</Text>
                      <Badge tone={item.status === "eligible" ? "ok" : "default"}>{titleCase(item.status)}</Badge>
                      <Badge>Form URL ready</Badge>
                    </View>
                    <Text style={styles.bodyText}>{formUrl}</Text>
                    <View style={styles.wrap}>
                      <ActionButton label="Inspect form" tone="secondary" icon={<ExternalLink color={colors.text} size={15} />} onPress={() => openExternal(formUrl)} />
                      <PrefillButton sweepstakeId={item.id} formUrl={formUrl} />
                    </View>
                  </Card>
                );
              })}

              {!tasks.length && !directSweepstakes.length ? (
                <Card>
                  <Text style={styles.bodyText}>No form URLs are ready for assisted prefill.</Text>
                </Card>
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function PrefillButton(props: { sweepstakeId: string; formUrl: string }) {
  const prefill = useApiMutation<{ reviewUrl: string }>("/forms/prefill", {
    onSuccess: (result) => {
      if (result?.reviewUrl) {
        // @ts-ignore The API returns a validated internal app path.
        router.push(toInternalPath(result.reviewUrl));
      }
    },
  });
  return (
    <ActionButton
      label="Prefill"
      disabled={prefill.isPending}
      icon={<Wand2 color={colors.black} size={15} />}
      onPress={() =>
        prefill.mutate({
          sweepstakeId: props.sweepstakeId,
          formUrl: props.formUrl,
          prefillApproved: "on",
          useAiFallback: "on",
        })
      }
    />
  );
}

function toInternalPath(reviewUrl: string) {
  try {
    return new URL(reviewUrl, "https://sweepscout.local").pathname;
  } catch {
    return reviewUrl;
  }
}
