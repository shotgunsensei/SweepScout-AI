import { Alert, Image, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react-native";
import { ActionButton, Badge, Card, ErrorNotice, LoadingState, PageHeader, RiskList, Screen, SectionHeader, openExternal, styles } from "@/components/ui";
import { colors } from "@/constants/colors";
import { apiGet, assetUrl, useApiMutation } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/format";
import type { EntryLog, Sweepstake } from "@/lib/types";

type EntryReviewResponse = { entry: EntryLog; sweepstake: Sweepstake | null; formUrl: string | null };

export default function EntryReviewScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["entry-review", params.id],
    queryFn: () => apiGet<EntryReviewResponse>(`/entries/${params.id}/review`),
    enabled: Boolean(params.id),
  });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <PageHeader title="Review & Submit Manually" kicker={data?.entry.sweepstakeTitle ?? "Entry review"}>
          {data?.formUrl ? (
            <ActionButton
              label="Open Form"
              icon={<ExternalLink color={colors.black} size={15} />}
              onPress={() => openExternal(data.formUrl)}
            />
          ) : null}
        </PageHeader>
        <View style={{ padding: 16, gap: 16 }}>
          {isLoading ? <LoadingState /> : null}
          {isError ? <ErrorNotice title="Unable to load entry" body="The entry could not be found or the API request failed." /> : null}
          {data ? <EntryReviewBody entry={data.entry} sweepstake={data.sweepstake} /> : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function EntryReviewBody({ entry, sweepstake }: { entry: EntryLog; sweepstake: Sweepstake | null }) {
  const markStatus = useApiMutation("/entries/status");
  const screenshot = assetUrl(entry.screenshotPath);
  return (
    <>
      <Card>
        <View style={styles.wrap}>
          <Badge tone={entry.status === "prefilled" ? "ok" : "warn"}>{titleCase(entry.status)}</Badge>
          <Badge>{formatDate(entry.attemptedAt)}</Badge>
        </View>
        <Text style={styles.bodyText}>Review the prefilled fields in the controlled browser output before doing anything on the live form.</Text>
        <Text style={styles.bodyText}>Complete CAPTCHA, terms, eligibility confirmations, and final submit manually. SweepScout AI does not solve CAPTCHA or submit entries.</Text>
        <Text style={styles.bodyText}>{entry.notes}</Text>
        {entry.blockers?.length ? (
          <View style={styles.wrap}>
            {entry.blockers.map((blocker) => (
              <Badge key={blocker} tone="warn">{blocker}</Badge>
            ))}
          </View>
        ) : null}
        {sweepstake?.riskFlags ? <RiskList flags={sweepstake.riskFlags} /> : null}
        <ActionButton
          label="Mark Submitted Manually"
          disabled={markStatus.isPending}
          onPress={() => {
            Alert.alert("Confirm live submission", "Only mark submitted after you personally reviewed rules, eligibility, terms, and the final form.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Mark Submitted",
                onPress: () =>
                  markStatus.mutate({
                    sweepstakeId: entry.sweepstakeId,
                    status: "submitted",
                    notes: `Submitted manually after reviewing prefill attempt ${entry.id}.`,
                    userApproved: "on",
                    reviewConfirmed: "on",
                  }),
              },
            ]);
          }}
        />
      </Card>

      <Card>
        <SectionHeader title="Prefill Screenshot" />
        {screenshot ? (
          <Image source={{ uri: screenshot }} style={{ width: "100%", minHeight: 420, borderRadius: 8, backgroundColor: colors.black }} resizeMode="contain" />
        ) : (
          <Text style={styles.bodyText}>No screenshot was captured for this attempt.</Text>
        )}
      </Card>

      <Card>
        <SectionHeader title="Field Mapping" />
        {entry.prefillFields?.length ? (
          <View style={{ gap: 10 }}>
            {entry.prefillFields.map((field) => (
              <Card key={field.fieldId} compact>
                <Text style={styles.cardTitle}>{field.label}</Text>
                <Text style={styles.bodyText}>Mapped profile field: {field.profileField ?? "None"}</Text>
                <View style={styles.wrap}>
                  <Badge tone={field.status === "filled" ? "ok" : field.status === "blocked" ? "danger" : "warn"}>{titleCase(field.status)}</Badge>
                  <Badge>{field.source}</Badge>
                </View>
                <Text style={styles.bodyText}>{field.reason}</Text>
              </Card>
            ))}
          </View>
        ) : (
          <Text style={styles.bodyText}>Field-level mapping details are not available for this attempt.</Text>
        )}
      </Card>
    </>
  );
}
