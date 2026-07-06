import type { ReactNode } from "react";
import { Bell, Bot, LockKeyhole, SlidersHorizontal } from "lucide-react";
import { updateSettingsAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { SectionHeader } from "@/components/dashboard-kit";
import { Badge, Checkbox, PageHeader, Panel, SubmitButton, TextInput } from "@/components/ui";
import { getAppConfig } from "@/lib/env";
import { getStore } from "@/lib/storage/store";

export const dynamic = "force-dynamic";

export default async function DashboardSettingsPage() {
  const store = await getStore();
  const [settings, config] = await Promise.all([store.getSettings(), Promise.resolve(getAppConfig())]);

  return (
    <AppShell>
      <PageHeader title="Settings" kicker={`${store.mode} storage`}>
        <Badge tone="ok">Manual approval always required</Badge>
      </PageHeader>
      <div className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
        <Panel>
          <form action={updateSettingsAction} className="grid gap-6">
            <section className="grid gap-3">
              <SectionHeading icon={<Bot size={18} aria-hidden />} title="Automation controls" />
              <div className="grid gap-3 rounded-md border border-line bg-panel-strong p-4">
                <Checkbox
                  name="automatedDiscoveryEnabled"
                  label="Enable automated discovery jobs"
                  defaultChecked={settings.automatedDiscoveryEnabled}
                />
                <Checkbox
                  name="formPrefillEnabled"
                  label="Enable assisted form prefill"
                  defaultChecked={settings.formPrefillEnabled}
                />
                <div className="border-t border-line pt-3">
                  <input type="hidden" name="requireApprovalForEveryEntry" value="true" />
                  <Checkbox name="manualApprovalLocked" label="Manual approval required for every entry" checked disabled readOnly />
                  <p className="mt-2 text-sm text-muted">
                    This control is locked. SweepScout never submits entries without explicit user review and approval.
                  </p>
                </div>
              </div>
            </section>

            <section className="grid gap-3">
              <SectionHeading icon={<SlidersHorizontal size={18} aria-hidden />} title="Scoring thresholds" />
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Discovery cadence">
                  <TextInput name="discoveryCadence" defaultValue={settings.discoveryCadence} />
                </Field>
                <Field label="Minimum eligibility score">
                  <TextInput name="minEligibilityScore" type="number" min={0} max={100} defaultValue={settings.minEligibilityScore} />
                </Field>
                <Field label="Maximum scam score">
                  <TextInput name="maxScamScore" type="number" min={0} max={100} defaultValue={settings.maxScamScore} />
                </Field>
                <Field label="Daily entry limit">
                  <TextInput name="dailyEntryLimit" type="number" min={1} max={100} defaultValue={settings.dailyEntryLimit} />
                </Field>
              </div>
            </section>

            <section className="grid gap-3">
              <SectionHeading icon={<Bell size={18} aria-hidden />} title="Notifications" />
              <Field label="Notifications email">
                <TextInput name="notificationsEmail" type="email" defaultValue={settings.notificationsEmail} />
              </Field>
            </section>

            <div>
              <SubmitButton>Save Settings</SubmitButton>
            </div>
          </form>
        </Panel>

        <Panel>
          <SectionHeader title="Runtime" eyebrow="Environment state" />
          <div className="grid gap-3 text-sm">
            <RuntimeRow label="Storage" value={config.mode} />
            <RuntimeRow label="OpenAI" value={config.openaiConfigured ? "configured" : "missing"} />
            <RuntimeRow label="Supabase" value={config.supabaseConfigured ? "configured" : "fallback"} />
            <RuntimeRow label="Browser" value={config.browserHeadless ? "headless" : "visible"} />
            <RuntimeRow label="Automated discovery" value={settings.automatedDiscoveryEnabled ? "enabled" : "disabled"} />
            <RuntimeRow label="Form prefill" value={settings.formPrefillEnabled ? "enabled" : "disabled"} />
          </div>
          <div className="mt-5 rounded-md border border-line bg-panel-strong p-4 text-sm text-muted">
            <h3 className="mb-2 flex items-center gap-2 font-semibold text-foreground">
              <LockKeyhole size={17} aria-hidden /> Safety lock
            </h3>
            Manual approval remains enforced even if API callers omit the setting.
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function SectionHeading(props: { icon: ReactNode; title: string }) {
  return (
    <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
      {props.icon}
      {props.title}
    </h2>
  );
}

function Field(props: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-foreground">
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}

function RuntimeRow(props: { label: string; value: string }) {
  return (
    <p className="flex justify-between gap-4 border-b border-line pb-2 last:border-b-0 last:pb-0">
      <span className="text-muted">{props.label}</span>
      <span className="text-foreground">{props.value}</span>
    </p>
  );
}
