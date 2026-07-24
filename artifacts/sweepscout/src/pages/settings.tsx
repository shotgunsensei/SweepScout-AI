import { useState, type ReactNode } from "react";
import { Bell, Bot, Clock3, Download, Inbox, LockKeyhole, ScrollText, ShieldCheck, SlidersHorizontal, Trash2, UserRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { ErrorNotice, LoadingState, SectionHeader } from "@/components/dashboard-kit";
import { Badge, Checkbox, PageHeader, Panel, SubmitButton, TextInput } from "@/components/ui";
import { apiGet } from "@/lib/api";
import { formToObject, useApiMutation } from "@/lib/forms";
import type { AppConfig, AppSettings } from "@/lib/types";

type SettingsResponse = { settings: AppSettings; config: AppConfig; mode: string };

export default function SettingsPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<SettingsResponse>("/settings") });

  return (
    <AppShell>
      <PageHeader title="Settings" kicker={data ? `${data.mode} storage` : "Loading settings"}>
        <Badge tone="ok">Manual approval always required</Badge>
      </PageHeader>
      {isLoading ? <LoadingState /> : null}
      {isError ? <ErrorNotice title="Unable to load settings" body="The API request failed. Confirm the API server is running." /> : null}
      <AccountProfilePanel />
      {data ? <SettingsBody settings={data.settings} config={data.config} /> : null}
    </AppShell>
  );
}

type PersonalProfile = {
  email: string;
  displayName: string;
  timezone: string;
  countryCode: string | null;
  stateOrRegion: string | null;
  postalCode: string | null;
  birthDate: string | null;
  platformRole: "user" | "admin" | "owner";
};

function AccountProfilePanel() {
  const profile = useQuery({ queryKey: ["personal-profile"], queryFn: () => apiGet<PersonalProfile>("/auth/profile") });
  const save = useApiMutation<PersonalProfile>("/auth/profile", { method: "PUT" });
  const deletion = useApiMutation<{ status: string; requestedAt: string; scheduledFor: string | null; retentionUntil: string | null }>("/auth/account-deletion");
  const [deletionReason, setDeletionReason] = useState("");
  if (profile.isLoading) return <LoadingState title="Loading private profile" />;
  if (!profile.data) return profile.isError ? <ErrorNotice title="Unable to load private profile" body="Your authenticated profile could not be loaded." /> : null;
  return (
    <Panel>
      <SectionHeader title="Personal flight profile" eyebrow="Private account data" />
      <form className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => {
        event.preventDefault();
        const body = formToObject(event.currentTarget);
        save.mutate({
          ...body,
          countryCode: String(body.countryCode ?? "").toUpperCase(),
          birthDate: String(body.birthDate ?? "") || null,
        });
      }}>
        <Field label="Display name"><TextInput name="displayName" defaultValue={profile.data.displayName} /></Field>
        <Field label="Account email"><TextInput name="email" value={profile.data.email} disabled readOnly /></Field>
        <Field label="Timezone"><TextInput name="timezone" defaultValue={profile.data.timezone} /></Field>
        <Field label="Country code"><TextInput name="countryCode" maxLength={2} defaultValue={profile.data.countryCode ?? ""} /></Field>
        <Field label="State or region"><TextInput name="stateOrRegion" defaultValue={profile.data.stateOrRegion ?? ""} /></Field>
        <Field label="Postal code"><TextInput name="postalCode" defaultValue={profile.data.postalCode ?? ""} /></Field>
        <Field label="Birth date"><TextInput name="birthDate" type="date" defaultValue={profile.data.birthDate ?? ""} /></Field>
        <div className="flex items-end"><SubmitButton disabled={save.isPending}>{save.isPending ? "Saving…" : "Save private profile"}</SubmitButton></div>
      </form>
      <div className="mt-6 rounded-xl border border-accent/25 bg-accent/5 p-4">
        <h3 className="flex items-center gap-2 font-semibold text-foreground"><ShieldCheck size={17} /> Privacy controls</h3>
        <p className="mt-2 text-sm leading-6 text-muted">Download a machine-readable copy of account, activity, notification, subscription, and Pilot Credit records. Authentication credentials, session tokens, and server secrets are excluded.</p>
        <div className="mt-3 flex flex-wrap gap-3"><a href="/api/auth/data-export" download className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-accent/40 px-4 text-sm font-semibold text-accent"><Download size={16}/>Download my data</a><Link href="/policies/privacy" className="inline-flex min-h-10 items-center rounded-lg border border-line px-4 text-sm">Privacy Policy</Link><Link href="/policies" className="inline-flex min-h-10 items-center rounded-lg border border-line px-4 text-sm">Trust center</Link></div>
        <p className="mt-3 text-xs leading-5 text-muted">Only essential authentication, refresh, and CSRF-protection cookies are enabled. Optional analytics or advertising cookies are not configured.</p>
      </div>
      <div className="mt-6 rounded-xl border border-danger/25 bg-danger/5 p-4">
        <h3 className="flex items-center gap-2 font-semibold text-foreground"><Trash2 size={17} /> Account deletion request</h3>
        <p className="mt-2 text-sm leading-6 text-muted">Request an operator-reviewed deletion. Billing, audit, and legal retention checks happen before destructive removal.</p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row"><input value={deletionReason} onChange={(event) => setDeletionReason(event.currentTarget.value)} placeholder="Optional reason" className="h-10 flex-1 rounded-lg border border-line bg-panel-strong px-3 text-sm outline-none focus:border-danger" /><button type="button" disabled={deletion.isPending} onClick={() => deletion.mutate({ reason: deletionReason })} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-danger/40 px-4 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-60"><UserRound size={16} /> Request deletion</button></div>
      </div>
    </Panel>
  );
}

function SettingsBody({ settings, config }: { settings: AppSettings; config: AppConfig }) {
  const save = useApiMutation("/settings", { method: "PUT" });
  const scanInbox = useApiMutation<{ parsed: number; saved: number }>("/inbox/poll");
  const checkRules = useApiMutation<{ checked: number; changed: number; failed: number }>("/rules-monitor/check");
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
      <Panel>
        <form
          className="grid gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(formToObject(event.currentTarget));
          }}
        >
          <section className="grid gap-3">
            <SectionHeading icon={<Bot size={18} aria-hidden />} title="Automation controls" />
            <div className="grid gap-3 rounded-md border border-line bg-panel-strong p-4">
              <Checkbox name="automatedDiscoveryEnabled" label="Enable automated discovery jobs" defaultChecked={settings.automatedDiscoveryEnabled} />
              <input type="hidden" name="formPrefillEnabled" value="false" />
              <div className="border-t border-line pt-3">
                <input type="hidden" name="requireApprovalForEveryEntry" value="true" />
                <Checkbox name="manualApprovalLocked" label="Manual approval required for every entry" checked disabled readOnly />
                <p className="mt-2 text-sm text-muted">
                  This control is locked. Play Pack Pilot does not submit entries; users visit the sponsor's official site.
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

          <section className="grid gap-3">
            <SectionHeading icon={<ScrollText size={18} aria-hidden />} title="Rules-change monitoring" />
            <div className="grid gap-3 rounded-md border border-line bg-panel-strong p-4">
              <Checkbox name="rulesMonitorEnabled" label="Periodically re-check saved official rules URLs" defaultChecked={settings.rulesMonitor.enabled} />
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Rules check interval minutes">
                  <TextInput
                    name="rulesMonitorPollIntervalMinutes"
                    type="number"
                    min={30}
                    max={10080}
                    defaultValue={settings.rulesMonitor.pollIntervalMinutes}
                  />
                </Field>
                <Field label="Max rules checked per run">
                  <TextInput
                    name="rulesMonitorMaxChecksPerRun"
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={settings.rulesMonitor.maxChecksPerRun}
                  />
                </Field>
              </div>
              <p className="text-sm leading-6 text-muted">
                Play Pack Pilot hashes normalized official-rules page text and only alerts when deadline, eligibility, prize, or entry frequency changes.
              </p>
              <button
                className="inline-flex h-9 w-fit items-center justify-center rounded-md border border-line bg-panel px-3 text-sm font-medium text-foreground transition hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                disabled={checkRules.isPending}
                onClick={() => checkRules.mutate({})}
              >
                {checkRules.isPending ? "Checking..." : "Check Rules Now"}
              </button>
              {checkRules.data ? (
                <p className="text-sm text-ok">
                  Checked {checkRules.data.checked} rule page{checkRules.data.checked === 1 ? "" : "s"} and found {checkRules.data.changed} meaningful change
                  {checkRules.data.changed === 1 ? "" : "s"}.
                </p>
              ) : null}
              {checkRules.error ? <p className="text-sm text-danger">{checkRules.error.message}</p> : null}
            </div>
          </section>

          <section className="grid gap-3">
            <SectionHeading icon={<Inbox size={18} aria-hidden />} title="Dedicated inbox" />
            <div className="grid gap-3 rounded-md border border-line bg-panel-strong p-4">
              <Checkbox name="inboxEnabled" label="Enable sweepstakes inbox monitoring" defaultChecked={settings.inbox.enabled} />
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Provider">
                  <select
                    name="inboxProvider"
                    defaultValue={settings.inbox.provider}
                    className="h-10 w-full rounded-md border border-line bg-[#0d1112] px-3 text-sm text-foreground outline-none transition focus:border-accent"
                  >
                    <option value="gmail">Gmail IMAP</option>
                    <option value="imap">Custom IMAP</option>
                  </select>
                </Field>
                <Field label="Inbox email">
                  <TextInput name="inboxEmail" type="email" defaultValue={settings.inbox.email || config.inboxEmail} />
                </Field>
                <Field label="IMAP host">
                  <TextInput name="inboxHost" defaultValue={settings.inbox.host || "imap.gmail.com"} />
                </Field>
                <Field label="IMAP port">
                  <TextInput name="inboxPort" type="number" min={1} max={65535} defaultValue={settings.inbox.port} />
                </Field>
                <Field label="Mailbox">
                  <TextInput name="inboxMailbox" defaultValue={settings.inbox.mailbox} />
                </Field>
                <Field label="Poll interval minutes">
                  <TextInput name="inboxPollIntervalMinutes" type="number" min={5} max={1440} defaultValue={settings.inbox.pollIntervalMinutes} />
                </Field>
                <Field label="Max messages per scan">
                  <TextInput name="inboxMaxMessagesPerPoll" type="number" min={1} max={100} defaultValue={settings.inbox.maxMessagesPerPoll} />
                </Field>
              </div>
              <p className="text-sm leading-6 text-muted">
                Store the inbox password server-side as SWEEPSCOUT_IMAP_PASSWORD. Gmail accounts should use an app password.
              </p>
              <button
                className="inline-flex h-9 w-fit items-center justify-center rounded-md border border-line bg-panel px-3 text-sm font-medium text-foreground transition hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                disabled={scanInbox.isPending || !config.inboxConfigured}
                onClick={() => scanInbox.mutate({})}
              >
                {scanInbox.isPending ? "Scanning..." : "Scan Inbox Now"}
              </button>
              {scanInbox.data ? (
                <p className="text-sm text-ok">
                  Parsed {scanInbox.data.parsed} message{scanInbox.data.parsed === 1 ? "" : "s"} and stored {scanInbox.data.saved} alert
                  {scanInbox.data.saved === 1 ? "" : "s"}.
                </p>
              ) : null}
              {scanInbox.error ? <p className="text-sm text-danger">{scanInbox.error.message}</p> : null}
            </div>
          </section>

          <section className="grid gap-3">
            <SectionHeading icon={<Bell size={18} aria-hidden />} title="Email alias management" />
            <div className="grid gap-3 rounded-md border border-line bg-panel-strong p-4">
              <Checkbox name="emailAliasesEnabled" label="Generate a unique email alias per sweepstake" defaultChecked={settings.emailAliases.enabled} />
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Alias base email">
                  <TextInput
                    name="emailAliasBaseEmail"
                    type="email"
                    defaultValue={settings.emailAliases.baseEmail || settings.inbox.email || settings.notificationsEmail}
                    placeholder="john@gmail.com"
                  />
                </Field>
                <Field label="Alias prefix">
                  <TextInput name="emailAliasPrefix" defaultValue={settings.emailAliases.prefix} placeholder="sweep" />
                </Field>
                <Field label="Next alias sequence">
                  <TextInput name="emailAliasNextSequence" type="number" min={1} defaultValue={settings.emailAliases.nextSequence} />
                </Field>
                <Field label="Excessive email threshold">
                  <TextInput name="emailAliasExcessiveEmailThreshold" type="number" min={1} max={500} defaultValue={settings.emailAliases.excessiveEmailThreshold} />
                </Field>
                <Field label="Spam report window days">
                  <TextInput name="emailAliasSpamWindowDays" type="number" min={1} max={365} defaultValue={settings.emailAliases.spamWindowDays} />
                </Field>
              </div>
              <p className="text-sm leading-6 text-muted">
                Example: john@gmail.com with prefix sweep generates john+sweep-001@gmail.com. Keep using the generated alias when manually entering that sweepstake.
              </p>
            </div>
          </section>

          <section className="grid gap-3">
            <SectionHeading icon={<Clock3 size={18} aria-hidden />} title="Prize ROI estimates" />
            <div className="grid gap-3 rounded-md border border-line bg-panel-strong p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Manual entry minutes">
                  <TextInput name="roiManualEntryMinutes" type="number" min={1} max={120} defaultValue={settings.roi.manualEntryMinutes} />
                </Field>
                <Field label="Default win probability basis points">
                  <TextInput
                    name="roiDefaultWinProbabilityBasisPoints"
                    type="number"
                    min={1}
                    max={10000}
                    defaultValue={settings.roi.defaultWinProbabilityBasisPoints}
                  />
                </Field>
              </div>
              <p className="text-sm leading-6 text-muted">
                Expected value uses observed win rate when available, otherwise this baseline probability. Ten basis points equals 0.10%.
              </p>
            </div>
          </section>

          <div>
            <SubmitButton disabled={save.isPending}>Save Settings</SubmitButton>
          </div>
        </form>
      </Panel>

      <Panel>
        <SectionHeader title="Runtime" eyebrow="Environment state" />
        <div className="grid gap-3 text-sm">
          <RuntimeRow label="Storage" value={config.mode} />
          <RuntimeRow label="OpenAI" value={config.openaiConfigured ? "configured" : "missing"} />
          <RuntimeRow label="Supabase" value={config.supabaseConfigured ? "configured" : "fallback"} />
          <RuntimeRow label="Inbox env" value={config.inboxConfigured ? "configured" : "missing"} />
          <RuntimeRow label="Inbox provider" value={config.inboxProvider} />
          <RuntimeRow label="Inbox poll" value={settings.inbox.lastPollStatus} />
          <RuntimeRow label="Rules monitor" value={settings.rulesMonitor.enabled ? "enabled" : "disabled"} />
          <RuntimeRow label="Rules check" value={settings.rulesMonitor.lastCheckStatus} />
          <RuntimeRow label="Aliases" value={settings.emailAliases.enabled ? "enabled" : "disabled"} />
          <RuntimeRow label="Browser" value={config.browserHeadless ? "headless" : "visible"} />
          <RuntimeRow label="Automated discovery" value={settings.automatedDiscoveryEnabled ? "enabled" : "disabled"} />
          <RuntimeRow label="Entry automation" value="disabled" />
        </div>
        {settings.inbox.lastPollError ? (
          <div className="mt-4 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm leading-6 text-danger">
            {settings.inbox.lastPollError}
          </div>
        ) : null}
        {settings.rulesMonitor.lastCheckError ? (
          <div className="mt-4 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm leading-6 text-danger">
            {settings.rulesMonitor.lastCheckError}
          </div>
        ) : null}
        <div className="mt-5 rounded-md border border-line bg-panel-strong p-4 text-sm text-muted">
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-foreground">
            <LockKeyhole size={17} aria-hidden /> Safety lock
          </h3>
          Manual approval remains enforced even if API callers omit the setting.
        </div>
      </Panel>
    </div>
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
