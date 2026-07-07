import { View, Text, StyleSheet } from "react-native";
import { ExternalLink, ShieldAlert, ShieldCheck } from "lucide-react-native";
import { Badge, Card, ScorePill, RiskList, ActionButton, openExternal, styles as uiStyles } from "@/components/ui";
import { colors } from "@/constants/colors";
import { daysUntil, formatCurrency, formatDate, titleCase } from "@/lib/format";
import type { Sweepstake } from "@/lib/types";

export function SweepstakeCard(props: { item: Sweepstake; compact?: boolean; children?: React.ReactNode }) {
  const item = props.item;
  return (
    <Card>
      <View style={local.headerRow}>
        <View style={local.titleCol}>
          <Text style={local.title}>{item.title}</Text>
          <Text style={uiStyles.bodyText}>
            {item.sponsor} | {formatCurrency(item.prizeRetailValue)} | {item.category}
          </Text>
        </View>
        <View style={local.scoreCol}>
          <ScorePill label="Eligible" value={item.eligibilityScore} />
          <ScorePill label="Risk" value={item.scamScore} invert />
        </View>
      </View>

      <View style={uiStyles.wrap}>
        <EligibilityBadge item={item} />
        <RiskBadge item={item} />
        <DeadlineBadge item={item} />
        <Badge tone={item.entryFrequency.toLowerCase().includes("daily") ? "ok" : "default"}>{item.entryFrequency}</Badge>
        {item.hasCaptcha ? <Badge tone="warn">CAPTCHA manual-only</Badge> : null}
        {item.purchaseRequired ? <Badge tone="danger">Purchase flagged</Badge> : null}
      </View>

      {!props.compact ? <Text style={uiStyles.bodyText}>{item.eligibilitySummary}</Text> : null}
      {!props.compact ? <RiskList flags={item.riskFlags} /> : null}

      <View style={uiStyles.wrap}>
        <Badge>{item.country}</Badge>
        <Badge>{item.stateEligibility.includes("ALL") ? "All states" : `${item.stateEligibility.length} states`}</Badge>
        <Badge>{item.ageRequirement ? `${item.ageRequirement}+` : "Age unknown"}</Badge>
      </View>

      <View style={uiStyles.wrap}>
        <ActionButton label="Source" tone="secondary" icon={<ExternalLink color={colors.text} size={15} />} onPress={() => openExternal(item.url)} />
        {item.rulesUrl ? (
          <ActionButton label="Rules" tone="secondary" icon={<ExternalLink color={colors.text} size={15} />} onPress={() => openExternal(item.rulesUrl)} />
        ) : null}
        {props.children}
      </View>
    </Card>
  );
}

export function EligibilityBadge({ item }: { item: Sweepstake }) {
  if (item.status === "eligible") {
    return <Badge tone="ok">Eligible</Badge>;
  }
  if (item.status === "ineligible" || item.status === "expired" || item.status === "rejected") {
    return <Badge tone="danger">{titleCase(item.status)}</Badge>;
  }
  if (item.status === "suspicious" || item.status === "needs_review") {
    return <Badge tone="warn">Review</Badge>;
  }
  return <Badge>{titleCase(item.status)}</Badge>;
}

export function RiskBadge({ item }: { item: Sweepstake }) {
  if (item.scamScore >= 70) return <Badge tone="danger">Risk {item.scamScore}</Badge>;
  if (item.scamScore >= 45) return <Badge tone="warn">Risk {item.scamScore}</Badge>;
  return <Badge tone="ok">Risk {item.scamScore}</Badge>;
}

export function DeadlineBadge({ item }: { item: Sweepstake }) {
  const days = daysUntil(item.endAt);
  if (days === null) {
    return <Badge>Deadline unknown</Badge>;
  }
  if (days < 0) {
    return <Badge tone="danger">Expired</Badge>;
  }
  if (days <= 7) {
    return <Badge tone="warn">Ends in {days}d</Badge>;
  }
  return <Badge>Ends {formatDate(item.endAt)}</Badge>;
}

export function StatusIcon({ status }: { status: Sweepstake["status"] }) {
  if (status === "eligible") return <ShieldCheck color={colors.ok} size={18} />;
  return <ShieldAlert color={status === "suspicious" || status === "needs_review" ? colors.warning : colors.muted} size={18} />;
}

const local = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  titleCol: {
    flex: 1,
    gap: 6,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 22,
  },
  scoreCol: {
    gap: 8,
  },
});
