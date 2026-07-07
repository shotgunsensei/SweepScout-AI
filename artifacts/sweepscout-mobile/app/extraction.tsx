import { ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { FileSearch } from "lucide-react-native";
import { ActionButton, Badge, Card, ErrorNotice, LoadingState, PageHeader, Screen, SectionHeader, styles } from "@/components/ui";
import { colors } from "@/constants/colors";
import { apiGet, useApiMutation } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/format";
import type { AppConfig, ExtractionJob, Sweepstake } from "@/lib/types";

type ExtractionResponse = { sweepstakes: Sweepstake[]; jobs: ExtractionJob[]; config: AppConfig };

export default function ExtractionScreen() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["extraction"], queryFn: () => apiGet<ExtractionResponse>("/extraction") });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <PageHeader title="Rules Extraction Pipeline" kicker={data ? (data.config.openaiConfigured ? data.config.openaiModel : "OpenAI key missing") : "Loading pipeline"} />
        <View style={{ padding: 16, gap: 16 }}>
          {isLoading ? <LoadingState /> : null}
          {isError ? <ErrorNotice title="Unable to load extraction pipeline" body="The API request failed. Confirm the API server is running." /> : null}
          {data ? (
            <>
              <Card>
                <SectionHeader title="Extraction Queue" />
                <View style={{ gap: 12 }}>
                  {data.sweepstakes.map((item) => (
                    <ExtractionRow key={item.id} item={item} enabled={data.config.openaiConfigured} />
                  ))}
                </View>
              </Card>

              <Card>
                <SectionHeader title="Recent Jobs" />
                <View style={{ gap: 10 }}>
                  {data.jobs.length ? (
                    data.jobs.map((job) => (
                      <Card key={job.id} compact>
                        <View style={[styles.row, { justifyContent: "space-between" }]}>
                          <Text style={[styles.cardTitle, { flex: 1 }]}>{job.sweepstakeId}</Text>
                          <Badge tone={job.status === "completed" ? "ok" : job.status === "failed" ? "danger" : "warn"}>{titleCase(job.status)}</Badge>
                        </View>
                        <Text style={styles.bodyText}>{job.summary ?? job.error ?? "Running"}</Text>
                      </Card>
                    ))
                  ) : (
                    <Text style={styles.bodyText}>No extraction jobs yet.</Text>
                  )}
                </View>
              </Card>
            </>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function ExtractionRow({ item, enabled }: { item: Sweepstake; enabled: boolean }) {
  const runExtraction = useApiMutation("/extraction/run");
  return (
    <Card compact>
      <View style={styles.wrap}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Badge tone={item.rulesExtractedAt ? "ok" : "warn"}>{item.rulesExtractedAt ? "Extracted" : "Pending"}</Badge>
      </View>
      <Text style={styles.bodyText}>
        Rules: {item.rulesUrl ?? "source page"} | {formatDate(item.rulesExtractedAt)}
      </Text>
      <ActionButton
        label={enabled ? "Extract" : "Key required"}
        disabled={!enabled || runExtraction.isPending}
        icon={<FileSearch color={enabled ? colors.black : colors.text} size={15} />}
        onPress={() => runExtraction.mutate({ sweepstakeId: item.id })}
      />
    </Card>
  );
}
