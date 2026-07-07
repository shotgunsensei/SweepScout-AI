import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, ErrorNotice, LabeledInput, LoadingState, PageHeader, Screen, SectionHeader, ToggleRow, ActionButton, styles } from "@/components/ui";
import { apiGet, useApiMutation } from "@/lib/api";
import type { AppConfig, AppSettings } from "@/lib/types";

type SettingsResponse = { settings: AppSettings; config: AppConfig; mode: string };

export default function SettingsScreen() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<SettingsResponse>("/settings") });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <PageHeader title="Settings" kicker={data ? `${data.mode} storage` : "Loading settings"}>
          <Badge tone="ok">Manual approval always required</Badge>
        </PageHeader>
        <View style={{ padding: 16, gap: 18 }}>
          {isLoading ? <LoadingState /> : null}
          {isError ? <ErrorNotice title="Unable to load settings" body="The API request failed. Confirm the API server is running." /> : null}
          {data ? <SettingsForm settings={data.settings} config={data.config} /> : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function SettingsForm({ settings, config }: { settings: AppSettings; config: AppConfig }) {
  const save = useApiMutation("/settings", { method: "PUT" });
  const [automatedDiscoveryEnabled, setAutomatedDiscoveryEnabled] = useState(settings.automatedDiscoveryEnabled);
  const [formPrefillEnabled, setFormPrefillEnabled] = useState(settings.formPrefillEnabled);
  const [discoveryCadence, setDiscoveryCadence] = useState(settings.discoveryCadence);
  const [minEligibilityScore, setMinEligibilityScore] = useState(String(settings.minEligibilityScore));
  const [maxScamScore, setMaxScamScore] = useState(String(settings.maxScamScore));
  const [dailyEntryLimit, setDailyEntryLimit] = useState(String(settings.dailyEntryLimit));
  const [notificationsEmail, setNotificationsEmail] = useState(settings.notificationsEmail);

  useEffect(() => {
    setAutomatedDiscoveryEnabled(settings.automatedDiscoveryEnabled);
    setFormPrefillEnabled(settings.formPrefillEnabled);
    setDiscoveryCadence(settings.discoveryCadence);
    setMinEligibilityScore(String(settings.minEligibilityScore));
    setMaxScamScore(String(settings.maxScamScore));
    setDailyEntryLimit(String(settings.dailyEntryLimit));
    setNotificationsEmail(settings.notificationsEmail);
  }, [settings]);

  return (
    <>
      <Card>
        <SectionHeader title="Automation controls" />
        <ToggleRow label="Enable automated discovery jobs" value={automatedDiscoveryEnabled} onValueChange={setAutomatedDiscoveryEnabled} />
        <ToggleRow label="Enable assisted form prefill" value={formPrefillEnabled} onValueChange={setFormPrefillEnabled} />
        <ToggleRow
          label="Manual approval required for every entry"
          value
          disabled
          onValueChange={() => undefined}
          hint="This control is locked. SweepScout never submits entries without explicit user review and approval."
        />
      </Card>

      <Card>
        <SectionHeader title="Scoring thresholds" />
        <LabeledInput label="Discovery cadence" value={discoveryCadence} onChangeText={setDiscoveryCadence} />
        <LabeledInput label="Minimum eligibility score" value={minEligibilityScore} onChangeText={setMinEligibilityScore} keyboardType="numeric" />
        <LabeledInput label="Maximum scam score" value={maxScamScore} onChangeText={setMaxScamScore} keyboardType="numeric" />
        <LabeledInput label="Daily entry limit" value={dailyEntryLimit} onChangeText={setDailyEntryLimit} keyboardType="numeric" />
        <LabeledInput label="Notifications email" value={notificationsEmail} onChangeText={setNotificationsEmail} keyboardType="email-address" />
        <ActionButton
          label="Save Settings"
          disabled={save.isPending}
          onPress={() =>
            save.mutate({
              automatedDiscoveryEnabled: automatedDiscoveryEnabled ? "on" : undefined,
              formPrefillEnabled: formPrefillEnabled ? "on" : undefined,
              requireApprovalForEveryEntry: "true",
              discoveryCadence,
              minEligibilityScore,
              maxScamScore,
              dailyEntryLimit,
              notificationsEmail,
            })
          }
        />
      </Card>

      <Card>
        <SectionHeader title="Runtime" eyebrow="Environment state" />
        <View style={{ gap: 8 }}>
          <RuntimeRow label="Storage" value={config.mode} />
          <RuntimeRow label="OpenAI" value={config.openaiConfigured ? "configured" : "missing"} />
          <RuntimeRow label="Supabase" value={config.supabaseConfigured ? "configured" : "fallback"} />
          <RuntimeRow label="Browser" value={config.browserHeadless ? "headless" : "visible"} />
          <RuntimeRow label="Automated discovery" value={automatedDiscoveryEnabled ? "enabled" : "disabled"} />
          <RuntimeRow label="Form prefill" value={formPrefillEnabled ? "enabled" : "disabled"} />
        </View>
      </Card>
    </>
  );
}

function RuntimeRow(props: { label: string; value: string }) {
  return (
    <View style={[styles.row, { justifyContent: "space-between" }]}>
      <Badge>{props.label}</Badge>
      <Badge tone="ok">{props.value}</Badge>
    </View>
  );
}
