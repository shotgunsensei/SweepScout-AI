import { Alert, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, CheckCircle2, Clock3, Flag, SkipForward, Trophy } from "lucide-react-native";
import {
  ActionButton,
  Badge,
  Card,
  EmptyState,
  ErrorNotice,
  LoadingState,
  MetricCard,
  PageHeader,
  Screen,
  SectionHeader,
  styles,
} from "@/components/ui";
import { colors } from "@/constants/colors";
import { apiGet, useApiMutation } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/format";
import type { EntryLog, EntryQueueItem, EntryTrackingData, ReminderDay, Sweepstake } from "@/lib/types";

export default function EntriesScreen() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["entries-tracking"], queryFn: () => apiGet<EntryTrackingData>("/entries/tracking") });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <PageHeader title="Entry Tracking" kicker="Frequency-aware manual entry log" />
        <View style={{ padding: 16, gap: 18 }}>
          {isLoading ? <LoadingState /> : null}
          {isError ? <ErrorNotice title="Unable to load entry tracking" body="The API request failed. Confirm the API server is running." /> : null}
          {data ? <EntriesBody data={data} /> : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function EntriesBody({ data }: { data: EntryTrackingData }) {
  return (
    <>
      <View style={styles.wrap}>
        <MetricCard label="Eligible" value={data.eligibleQueue.length} sublabel="ready now" />
        <MetricCard label="Submitted" value={data.submittedEntries.length} sublabel="manual entries" />
        <MetricCard label="Expiring" value={data.expiringSoon.length} sublabel="within 7 days" />
        <MetricCard label="Review" value={data.suspiciousRejected.length} sublabel="suspicious/rejected" />
        <MetricCard label="Won" value={data.wonNotifications.length} sublabel="notifications" />
      </View>

      <Card>
        <SectionHeader title="Eligible Queue" eyebrow="Allowed entry windows" action={<Badge tone="ok">{data.eligibleQueue.length} ready</Badge>} />
        <View style={{ gap: 12 }}>
          {data.eligibleQueue.length ? (
            data.eligibleQueue.map((item) => <QueueItem key={item.sweepstake.id} item={item} />)
          ) : (
            <EmptyState title="No eligible entries ready" body="Sweepstakes will appear here when rules, frequency, and compliance checks allow another manual entry." />
          )}
        </View>
      </Card>

      <Card>
        <SectionHeader title="Repeat Entry Reminders" eyebrow="Daily, weekly, and monthly cadence" />
        <ReminderCalendar days={data.reminders} />
      </Card>

      <EntryListPanel title="Submitted Entries" entries={data.submittedEntries} empty="No manual submissions recorded yet." />
      <ExpiringSoonPanel items={data.expiringSoon} />
      <ReviewPanel items={data.suspiciousRejected} />
      <EntryListPanel title="Won / Notification Tracking" entries={data.wonNotifications} empty="No winner notifications recorded yet." />
    </>
  );
}

function QueueItem({ item }: { item: EntryQueueItem }) {
  return (
    <Card compact>
      <View style={styles.wrap}>
        <Text style={styles.cardTitle}>{item.sweepstake.title}</Text>
        <Badge tone="ok">{item.frequencyLabel}</Badge>
        <Badge>{item.sweepstake.hasCaptcha ? "Manual CAPTCHA" : "No CAPTCHA flag"}</Badge>
      </View>
      <Text style={styles.bodyText}>
        Ends {formatDate(item.sweepstake.endAt)} | Last submitted {formatDate(item.lastSubmittedAt)}
      </Text>
      <Text style={styles.bodyText}>{item.sweepstake.complianceNotes[0] ?? "Eligible for manual entry tracking."}</Text>
      <EntryActions sweepstake={item.sweepstake} submitted />
    </Card>
  );
}

function EntryActions({ sweepstake, submitted = false }: { sweepstake: Sweepstake; submitted?: boolean }) {
  return (
    <View style={styles.wrap}>
      {submitted ? <StatusButton sweepstakeId={sweepstake.id} status="submitted" label="Submitted" icon="check" /> : null}
      <StatusButton sweepstakeId={sweepstake.id} status="skipped" label="Skipped" icon="skip" />
      <StatusButton sweepstakeId={sweepstake.id} status="suspicious" label="Suspicious" icon="flag" />
      <StatusButton sweepstakeId={sweepstake.id} status="winner_notification" label="Winner Notice" icon="trophy" />
      <StatusButton sweepstakeId={sweepstake.id} status="expired" label="Expired" icon="clock" />
    </View>
  );
}

function StatusButton(props: {
  sweepstakeId: string;
  status: "submitted" | "skipped" | "suspicious" | "winner_notification" | "expired";
  label: string;
  icon: "check" | "skip" | "flag" | "trophy" | "clock";
}) {
  const markStatus = useApiMutation("/entries/status");
  const Icon = props.icon === "check" ? CheckCircle2 : props.icon === "skip" ? SkipForward : props.icon === "flag" ? Flag : props.icon === "trophy" ? Trophy : Clock3;
  const tone = props.status === "suspicious" || props.status === "expired" ? "danger" : props.status === "submitted" ? "primary" : "secondary";

  return (
    <ActionButton
      label={props.label}
      tone={tone}
      disabled={markStatus.isPending}
      icon={<Icon color={tone === "primary" ? colors.black : colors.text} size={15} />}
      onPress={() => {
        Alert.alert("Confirm manual review", `Mark this entry as ${props.label}?`, [
          { text: "Cancel", style: "cancel" },
          {
            text: "Confirm",
            onPress: () =>
              markStatus.mutate({
                sweepstakeId: props.sweepstakeId,
                status: props.status,
                notes: props.status === "submitted" ? "Submitted manually from eligible queue." : `${props.label} from entry tracking.`,
                userApproved: props.status === "submitted" ? "on" : undefined,
                reviewConfirmed: "on",
              }),
          },
        ]);
      }}
    />
  );
}

function ReminderCalendar({ days }: { days: ReminderDay[] }) {
  return (
    <View style={{ gap: 10 }}>
      {days.map((day) => (
        <Card key={day.date} compact>
          <View style={[styles.row, { justifyContent: "space-between" }]}>
            <Text style={styles.cardTitle}>{day.label}</Text>
            {day.reminders.length ? <Bell size={16} color={colors.accent} /> : null}
          </View>
          {day.reminders.slice(0, 3).map((item) => (
            <Text key={item.sweepstake.id} style={styles.bodyText}>
              {item.sweepstake.title} | {item.frequencyLabel}
            </Text>
          ))}
          {day.reminders.length > 3 ? <Text style={styles.mutedText}>+{day.reminders.length - 3} more</Text> : null}
          {!day.reminders.length ? <Text style={styles.mutedText}>No reminders</Text> : null}
        </Card>
      ))}
    </View>
  );
}

function EntryListPanel(props: { title: string; entries: EntryLog[]; empty: string }) {
  return (
    <Card>
      <SectionHeader title={props.title} />
      <View style={{ gap: 12 }}>
        {props.entries.length ? (
          props.entries.map((entry) => (
            <Card key={entry.id} compact>
              <View style={[styles.row, { justifyContent: "space-between", alignItems: "flex-start" }]}>
                <Text style={[styles.cardTitle, { flex: 1 }]}>{entry.sweepstakeTitle}</Text>
                <Badge tone={entryTone(entry.status)}>{titleCase(entry.status)}</Badge>
              </View>
              <Text style={styles.bodyText}>{formatDate(entry.submittedAt ?? entry.attemptedAt)}</Text>
              <Text style={styles.bodyText}>{entry.notes}</Text>
              {entry.status === "submitted" ? (
                <View style={styles.wrap}>
                  <StatusButton sweepstakeId={entry.sweepstakeId} status="winner_notification" label="Winner Notice" icon="trophy" />
                  <StatusButton sweepstakeId={entry.sweepstakeId} status="suspicious" label="Suspicious" icon="flag" />
                </View>
              ) : null}
              {entry.status === "prefilled" ? (
                <ActionButton
                  label="Review prefill"
                  tone="secondary"
                  onPress={() => router.push({ pathname: "/entry-review/[id]", params: { id: entry.id } })}
                />
              ) : null}
            </Card>
          ))
        ) : (
          <EmptyState title="Nothing here yet" body={props.empty} />
        )}
      </View>
    </Card>
  );
}

function ExpiringSoonPanel({ items }: { items: EntryQueueItem[] }) {
  return (
    <Card>
      <SectionHeader title="Expiring Soon" />
      <View style={{ gap: 12 }}>
        {items.length ? (
          items.map((item) => (
            <Card key={item.sweepstake.id} compact>
              <View style={styles.wrap}>
                <Text style={styles.cardTitle}>{item.sweepstake.title}</Text>
                <Badge tone={item.canEnter ? "warn" : "default"}>{item.frequencyLabel}</Badge>
              </View>
              <Text style={styles.bodyText}>Ends {formatDate(item.sweepstake.endAt)}</Text>
              <Text style={styles.bodyText}>{item.blockedReason ?? "Ready for manual entry."}</Text>
              {item.canEnter ? <EntryActions sweepstake={item.sweepstake} submitted /> : null}
            </Card>
          ))
        ) : (
          <EmptyState title="No urgent deadlines" body="No tracked sweepstakes expire within the next week." />
        )}
      </View>
    </Card>
  );
}

function ReviewPanel({ items }: { items: Array<{ sweepstake: Sweepstake; latestEntry: EntryLog | null; reason: string }> }) {
  return (
    <Card>
      <SectionHeader title="Suspicious / Rejected" />
      <View style={{ gap: 12 }}>
        {items.length ? (
          items.map((item) => (
            <Card key={item.sweepstake.id} compact>
              <View style={styles.wrap}>
                <Text style={styles.cardTitle}>{item.sweepstake.title}</Text>
                <Badge tone={item.sweepstake.status === "expired" || item.sweepstake.status === "ineligible" ? "danger" : "warn"}>
                  {titleCase(item.sweepstake.status)}
                </Badge>
              </View>
              <Text style={styles.bodyText}>{item.reason}</Text>
              {item.latestEntry ? <Text style={styles.mutedText}>Last marked {formatDate(item.latestEntry.attemptedAt)}</Text> : null}
            </Card>
          ))
        ) : (
          <EmptyState title="No rejected items" body="No suspicious or rejected entries are active." />
        )}
      </View>
    </Card>
  );
}

function entryTone(status: EntryLog["status"]) {
  if (status === "submitted" || status === "winner_notification" || status === "prefilled") return "ok";
  if (status === "suspicious" || status === "expired" || status === "failed" || status === "blocked") return "danger";
  if (status === "skipped" || status === "rejected") return "warn";
  return "default";
}
