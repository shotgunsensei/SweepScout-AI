import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Bot, ClipboardCheck, FileSearch, Gauge, LockKeyhole, Radar, ShieldAlert } from "lucide-react-native";
import { Card, LinkRow, PageHeader, Screen, SectionHeader, styles } from "@/components/ui";
import { colors } from "@/constants/colors";

export default function OperationsScreen() {
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <PageHeader title="Operations" kicker="Mobile command paths" />
        <View style={{ padding: 16, gap: 18 }}>
          <Card>
            <SectionHeader title="Runbooks" eyebrow="Native shortcuts" />
            <View style={{ gap: 10 }}>
              <LinkRow label="Discovery Jobs" sublabel="Search-result discovery, no form submission" onPress={() => router.push("/discovery")} />
              <LinkRow label="Assistant Queue" sublabel="Human-approved staging, never auto-submit" onPress={() => router.push("/queue")} />
              <LinkRow label="Assisted Prefill Queue" sublabel="User-approved, manual-submit only" onPress={() => router.push("/entries-queue")} />
              <LinkRow label="Scam & Eligibility Scoring" sublabel="Risk score review and rescoring" onPress={() => router.push("/scoring")} />
              <LinkRow label="Rules Extraction Pipeline" sublabel="OpenAI-backed rules extraction status" onPress={() => router.push("/extraction")} />
              <LinkRow label="Secure Profile Vault" sublabel="Profile fields and consent boundary" onPress={() => router.push("/vault")} />
              <LinkRow label="Admin Debug" sublabel="Protected logs, blocked domains, and export tools" onPress={() => router.push("/admin")} />
            </View>
          </Card>

          <Card>
            <SectionHeader title="Safety Posture" eyebrow="SweepScout mobile mirrors the web guardrails" />
            <View style={styles.wrap}>
              <Radar color={colors.accent} size={20} />
              <FileSearch color={colors.accent} size={20} />
              <Gauge color={colors.accent} size={20} />
              <Bot color={colors.accent} size={20} />
              <ClipboardCheck color={colors.accent} size={20} />
              <LockKeyhole color={colors.accent} size={20} />
              <ShieldAlert color={colors.warning} size={20} />
            </View>
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}
