import { ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react-native";
import { ActionButton, Badge, Card, ErrorNotice, LoadingState, PageHeader, RiskList, ScorePill, Screen, styles } from "@/components/ui";
import { colors } from "@/constants/colors";
import { apiGet, useApiMutation } from "@/lib/api";
import { titleCase } from "@/lib/format";
import type { AppSettings, Sweepstake } from "@/lib/types";

type ScoringResponse = { sweepstakes: Sweepstake[]; settings: AppSettings };

export default function ScoringScreen() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["scoring"], queryFn: () => apiGet<ScoringResponse>("/scoring") });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <PageHeader
          title="Scam & Eligibility Scoring"
          kicker={data ? `Risk cap ${data.settings.maxScamScore} | eligibility floor ${data.settings.minEligibilityScore}` : "Loading scoring rules"}
        />
        <View style={{ padding: 16, gap: 12 }}>
          {isLoading ? <LoadingState /> : null}
          {isError ? <ErrorNotice title="Unable to load scoring" body="The API request failed. Confirm the API server is running." /> : null}
          {data
            ? data.sweepstakes
                .slice()
                .sort((a, b) => b.scamScore - a.scamScore)
                .map((item) => <ScoringCard key={item.id} item={item} />)
            : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function ScoringCard({ item }: { item: Sweepstake }) {
  const rescore = useApiMutation("/scoring/rescore");
  return (
    <Card>
      <View style={styles.wrap}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Badge tone={statusTone(item)}>{titleCase(item.status)}</Badge>
      </View>
      <View style={styles.wrap}>
        <ScorePill label="Eligible" value={item.eligibilityScore} />
        <ScorePill label="Risk" value={item.scamScore} invert />
      </View>
      {decisionNotes(item).map((note) => (
        <Text key={note} style={styles.bodyText}>{note}</Text>
      ))}
      <RiskList flags={item.riskFlags} />
      <ActionButton
        label="Rescore"
        tone="secondary"
        disabled={rescore.isPending}
        icon={<RefreshCw color={colors.text} size={15} />}
        onPress={() => rescore.mutate({ sweepstakeId: item.id })}
      />
    </Card>
  );
}

function statusTone(item: Sweepstake) {
  if (item.status === "eligible") return "ok";
  if (item.status === "ineligible" || item.status === "expired") return "danger";
  if (item.status === "suspicious" || item.status === "needs_review") return "warn";
  return "default";
}

function decisionNotes(item: Sweepstake) {
  if (item.complianceNotes.length) {
    return item.complianceNotes;
  }
  if (item.riskFlags.length) {
    return item.riskFlags.map((flag) => flag.label);
  }
  return ["No blocking compliance notes are active."];
}
