import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import {
  ActionButton,
  Badge,
  Card,
  ErrorNotice,
  LabeledInput,
  LoadingState,
  PageHeader,
  Screen,
  SectionHeader,
  ToggleRow,
  styles,
} from "@/components/ui";
import { colors } from "@/constants/colors";
import { apiGet, useApiMutation } from "@/lib/api";
import type { UserProfile } from "@/lib/types";

const profileVaultWarning =
  "SweepScout only stores the profile fields shown here. Never enter Social Security numbers, banking details, payment cards, or other sensitive financial credentials; they are intentionally unsupported.";

export default function VaultScreen() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["profile"], queryFn: () => apiGet<UserProfile>("/profile") });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <PageHeader title="Secure Profile Vault" kicker={data?.email ?? "Loading vault"}>
          <Badge tone={data?.consentToPrefill ? "ok" : "warn"}>{data?.consentToPrefill ? "Prefill consent enabled" : "Prefill consent off"}</Badge>
          <Badge tone="ok">Manual approval locked</Badge>
        </PageHeader>
        <View style={{ padding: 16, gap: 16 }}>
          {isLoading ? <LoadingState /> : null}
          {isError ? <ErrorNotice title="Unable to load vault" body="The API request failed. Confirm the API server is running." /> : null}
          {data ? <VaultBody profile={data} /> : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function VaultBody({ profile }: { profile: UserProfile }) {
  const save = useApiMutation("/profile", { method: "PUT" });
  const [showSensitive, setShowSensitive] = useState(false);
  const [form, setForm] = useState(() => toForm(profile));

  useEffect(() => setForm(toForm(profile)), [profile]);
  const update = (key: keyof typeof form) => (value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <>
      <Card>
        <Text style={[styles.cardTitle, { color: colors.warning }]}>Sensitive data boundary</Text>
        <Text style={styles.bodyText}>{profileVaultWarning}</Text>
      </Card>

      <Card>
        <SectionHeader title="Legal identity" />
        <LabeledInput label="Legal first name" value={form.firstName} onChangeText={update("firstName")} />
        <LabeledInput label="Legal last name" value={form.lastName} onChangeText={update("lastName")} />
        <LabeledInput label="Primary email" value={form.email} onChangeText={update("email")} keyboardType="email-address" />
        <LabeledInput label="Alternate email" value={form.alternateEmail} onChangeText={update("alternateEmail")} keyboardType="email-address" />
      </Card>

      <Card>
        <SectionHeader title="Sensitive contact details" action={<ActionButton label={showSensitive ? "Hide" : "Edit"} tone="secondary" onPress={() => setShowSensitive((value) => !value)} />} />
        {showSensitive ? (
          <>
            <LabeledInput label="Phone" value={form.phone} onChangeText={update("phone")} keyboardType="phone-pad" />
            <LabeledInput label="Date of birth" value={form.dob} onChangeText={update("dob")} placeholder="YYYY-MM-DD" />
            <LabeledInput label="Address line 1" value={form.address1} onChangeText={update("address1")} />
            <LabeledInput label="Address line 2" value={form.address2} onChangeText={update("address2")} />
            <LabeledInput label="City" value={form.city} onChangeText={update("city")} />
            <LabeledInput label="State" value={form.state} onChangeText={update("state")} />
            <LabeledInput label="Postal code" value={form.postalCode} onChangeText={update("postalCode")} />
            <LabeledInput label="Country" value={form.country} onChangeText={update("country")} />
          </>
        ) : (
          <Text style={styles.bodyText}>Sensitive contact fields are hidden until you choose to edit them.</Text>
        )}
      </Card>

      <Card>
        <SectionHeader title="Preferences and consent" />
        <LabeledInput label="Preferred sweepstakes categories" value={form.categories} onChangeText={update("categories")} hint="Comma separated, for discovery and scoring filters." />
        <LabeledInput label="Max daily entries" value={form.maxDailyEntries} onChangeText={update("maxDailyEntries")} keyboardType="numeric" />
        <ToggleRow label="Avoid purchase-required promotions" value={Boolean(form.avoidPurchaseRequired)} onValueChange={update("avoidPurchaseRequired")} />
        <ToggleRow label="Allow sweepstakes that require social actions" value={Boolean(form.allowSocialActions)} onValueChange={update("allowSocialActions")} />
        <ToggleRow
          label="Enable form prefill from this vault"
          value={Boolean(form.consentToPrefill)}
          onValueChange={update("consentToPrefill")}
          hint="Prefill only fills mapped profile fields and still stops before submit."
        />
        <ActionButton
          label="Save Vault"
          disabled={save.isPending}
          onPress={() =>
            save.mutate({
              ...form,
              categories: form.categories,
              avoidPurchaseRequired: form.avoidPurchaseRequired ? "on" : undefined,
              allowSocialActions: form.allowSocialActions ? "on" : undefined,
              consentToPrefill: form.consentToPrefill ? "on" : undefined,
              prefillConfirmation: form.consentToPrefill ? "on" : undefined,
            })
          }
        />
      </Card>

      <Card>
        <SectionHeader title="Vault Security" />
        <Text style={styles.bodyText}>SSN, banking details, payment cards, and payment credentials are intentionally unsupported.</Text>
        <Text style={styles.bodyText}>Assisted prefill needs vault consent, the global setting, and per-entry approval before it can run.</Text>
      </Card>
    </>
  );
}

function toForm(profile: UserProfile) {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    alternateEmail: profile.alternateEmail,
    phone: profile.phone,
    dob: profile.dob,
    address1: profile.address1,
    address2: profile.address2,
    city: profile.city,
    state: profile.state,
    postalCode: profile.postalCode,
    country: profile.country,
    categories: profile.preferences.categories.join(", "),
    maxDailyEntries: String(profile.preferences.maxDailyEntries),
    avoidPurchaseRequired: profile.preferences.avoidPurchaseRequired,
    allowSocialActions: profile.preferences.allowSocialActions,
    consentToPrefill: profile.consentToPrefill,
  };
}
