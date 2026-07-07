import type { ReactNode } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { AlertCircle, ChevronRight, Inbox } from "lucide-react-native";
import { colors } from "@/constants/colors";
import type { RiskFlag } from "@/lib/types";

export function Screen(props: { children: ReactNode; insetTop?: boolean }) {
  return <View style={[styles.screen, props.insetTop && styles.screenInset]}>{props.children}</View>;
}

export function PageHeader(props: { title: string; kicker?: string; children?: ReactNode }) {
  return (
    <View style={styles.pageHeader}>
      {props.kicker ? <Text style={styles.kicker}>{props.kicker}</Text> : null}
      <Text style={styles.title}>{props.title}</Text>
      {props.children ? <View style={styles.headerActions}>{props.children}</View> : null}
    </View>
  );
}

export function SectionHeader(props: { title: string; eyebrow?: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionText}>
        {props.eyebrow ? <Text style={styles.eyebrow}>{props.eyebrow}</Text> : null}
        <Text style={styles.sectionTitle}>{props.title}</Text>
      </View>
      {props.action}
    </View>
  );
}

export function Card(props: { children: ReactNode; compact?: boolean }) {
  return <View style={[styles.card, props.compact && styles.cardCompact]}>{props.children}</View>;
}

export function MetricCard(props: { label: string; value: string | number; sublabel?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{props.label}</Text>
      <Text style={styles.metricValue}>{props.value}</Text>
      {props.sublabel ? <Text style={styles.metricSub}>{props.sublabel}</Text> : null}
    </View>
  );
}

export function Badge(props: { children: ReactNode; tone?: "default" | "ok" | "warn" | "danger" }) {
  const tone = props.tone ?? "default";
  return (
    <View style={[styles.badge, badgeTone[tone]]}>
      <Text style={[styles.badgeText, badgeTextTone[tone]]}>{props.children}</Text>
    </View>
  );
}

export function ScorePill(props: { label: string; value: number; invert?: boolean }) {
  const danger = props.invert ? props.value >= 60 : props.value < 50;
  const warn = props.invert ? props.value >= 40 && props.value < 60 : props.value >= 50 && props.value < 75;
  const color = danger ? colors.danger : warn ? colors.warning : colors.ok;
  return (
    <View style={styles.scorePill}>
      <Text style={styles.mutedText}>{props.label}</Text>
      <Text style={[styles.scoreValue, { color }]}>{props.value}</Text>
    </View>
  );
}

export function RiskList({ flags }: { flags: RiskFlag[] }) {
  if (flags.length === 0) {
    return <Text style={styles.mutedText}>No active risk flags.</Text>;
  }
  return (
    <View style={styles.wrap}>
      {flags.map((flag) => (
        <Badge key={flag.code} tone={flag.severity === "high" ? "danger" : flag.severity === "medium" ? "warn" : "default"}>
          {flag.label}
        </Badge>
      ))}
    </View>
  );
}

export function LoadingState(props: { title?: string }) {
  return (
    <Card>
      <View style={styles.row}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.mutedText}>{props.title ?? "Loading SweepScout workspace"}</Text>
      </View>
    </Card>
  );
}

export function ErrorNotice(props: { title: string; body: string }) {
  return (
    <Card>
      <View style={styles.noticeRow}>
        <AlertCircle color={colors.warning} size={20} />
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{props.title}</Text>
          <Text style={styles.bodyText}>{props.body}</Text>
        </View>
      </View>
    </Card>
  );
}

export function EmptyState(props: { title: string; body: string }) {
  return (
    <Card>
      <View style={styles.emptyIcon}>
        <Inbox color={colors.muted} size={20} />
      </View>
      <Text style={[styles.cardTitle, styles.centerText]}>{props.title}</Text>
      <Text style={[styles.bodyText, styles.centerText]}>{props.body}</Text>
    </Card>
  );
}

export function ActionButton(props: {
  label: string;
  onPress: () => void;
  tone?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const tone = props.tone ?? "primary";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.button,
        buttonTone[tone],
        pressed && !props.disabled ? styles.pressed : null,
        props.disabled ? styles.disabled : null,
      ]}
    >
      {props.icon}
      <Text style={[styles.buttonText, tone === "primary" ? styles.primaryButtonText : null]}>{props.label}</Text>
    </Pressable>
  );
}

export function LinkRow(props: { label: string; sublabel?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={props.onPress} style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}>
      <View style={styles.flex}>
        <Text style={styles.linkLabel}>{props.label}</Text>
        {props.sublabel ? <Text style={styles.mutedText}>{props.sublabel}</Text> : null}
      </View>
      <ChevronRight color={colors.muted} size={18} />
    </Pressable>
  );
}

export function LabeledInput(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  hint?: string;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad";
  secureTextEntry?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={colors.subtle}
        keyboardType={props.keyboardType}
        secureTextEntry={props.secureTextEntry}
        multiline={props.multiline}
        style={[styles.input, props.multiline && styles.multilineInput]}
      />
      {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
    </View>
  );
}

export function ToggleRow(props: { label: string; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean; hint?: string }) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.flex}>
        <Text style={styles.fieldLabel}>{props.label}</Text>
        {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
      </View>
      <Switch
        value={props.value}
        onValueChange={props.onValueChange}
        disabled={props.disabled}
        trackColor={{ false: colors.lineStrong, true: colors.accentDim }}
        thumbColor={props.value ? colors.accent : colors.muted}
      />
    </View>
  );
}

export async function openExternal(url: string | null | undefined) {
  if (!url) return;
  await Linking.openURL(url);
}

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenInset: {
    paddingTop: 16,
  },
  pageHeader: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  kicker: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 0,
  },
  headerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12,
    marginBottom: 12,
  },
  sectionText: {
    flex: 1,
  },
  eyebrow: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0,
    marginBottom: 4,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 16,
    gap: 12,
  },
  cardCompact: {
    padding: 12,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  bodyText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  mutedText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  subtleText: {
    color: colors.subtle,
    fontSize: 12,
  },
  metric: {
    width: "48%",
    minWidth: 150,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 14,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  metricValue: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
    marginTop: 8,
  },
  metricSub: {
    color: colors.subtle,
    fontSize: 11,
    marginTop: 4,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  scorePill: {
    minWidth: 94,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceStrong,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  scoreValue: {
    fontSize: 22,
    fontWeight: "800",
    marginTop: 3,
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  noticeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  flex: {
    flex: 1,
  },
  emptyIcon: {
    alignSelf: "center",
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceStrong,
    marginBottom: 4,
  },
  centerText: {
    textAlign: "center",
  },
  button: {
    minHeight: 42,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  buttonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
    flexShrink: 1,
    textAlign: "center",
  },
  primaryButtonText: {
    color: colors.black,
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.55,
  },
  linkRow: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: colors.surface,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  linkLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  field: {
    gap: 7,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  input: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.black,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  multilineInput: {
    minHeight: 92,
    textAlignVertical: "top",
  },
  hint: {
    color: colors.subtle,
    fontSize: 12,
    lineHeight: 17,
  },
  toggleRow: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: colors.surfaceStrong,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});

const badgeTone = StyleSheet.create({
  default: { backgroundColor: colors.surfaceStrong },
  ok: { backgroundColor: "rgba(124, 247, 166, 0.14)" },
  warn: { backgroundColor: "rgba(255, 199, 111, 0.14)" },
  danger: { backgroundColor: "rgba(255, 129, 125, 0.14)" },
});

const badgeTextTone = StyleSheet.create({
  default: { color: colors.muted },
  ok: { color: colors.ok },
  warn: { color: colors.warning },
  danger: { color: colors.danger },
});

const buttonTone = StyleSheet.create({
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surfaceStrong, borderWidth: 1, borderColor: colors.line },
  danger: { backgroundColor: "rgba(255, 129, 125, 0.14)", borderWidth: 1, borderColor: "rgba(255, 129, 125, 0.35)" },
});
