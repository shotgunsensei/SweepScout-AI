import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  BellRing,
  CheckCircle2,
  Clock3,
  MailWarning,
  MapPin,
  RefreshCw,
  ShieldAlert,
  SkipForward,
  Smartphone,
  Trophy,
  UserRound,
} from "lucide-react";
import { Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorNotice, LoadingState, SectionHeader } from "@/components/dashboard-kit";
import { Badge, PageHeader, Panel, TextInput } from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";
import { categoryLabel } from "@/lib/prize-categories";
import {
  showPwaNotification,
  type BeforeInstallPromptEvent,
  type PwaNotificationPayload,
} from "@/lib/pwa";
import type { DailyWorkflowData, EntryLog, EntryStatus, InboxAlert, Sweepstake, UserProfile } from "@/lib/types";

type NotificationPrefs = {
  dailyQueue: boolean;
  winnerAlerts: boolean;
  expiringSoon: boolean;
};

type MobileQueueItem = {
  id: string;
  sweepstake: Sweepstake;
  label: string;
  detail: string;
  canSubmit: boolean;
  blockedReason: string | null;
};

type StatusPayload = {
  sweepstakeId: string;
  status: Extract<EntryStatus, "submitted" | "skipped" | "suspicious" | "winner_notification" | "expired">;
  userApproved: boolean;
  reviewConfirmed: boolean;
  purchaseRequiredAcknowledged: boolean;
  timeSpentMinutes?: number;
  notes: string;
};

const prefsKey = "sweepscout:pwa-notification-prefs";
const defaultPrefs: NotificationPrefs = {
  dailyQueue: true,
  winnerAlerts: true,
  expiringSoon: true,
};

export default function PwaCompanionPage() {
  const workflow = useQuery({
    queryKey: ["daily-workflow"],
    queryFn: () => apiGet<DailyWorkflowData>("/daily-workflow"),
  });
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => apiGet<UserProfile>("/profile") });

  return (
    <AppShell>
      <PageHeader title="Mobile Companion" kicker="Phone-first daily execution">
        <Badge tone="ok">Manual submit only</Badge>
        <Badge tone="warn">Claim links held</Badge>
      </PageHeader>

      {workflow.isLoading ? <LoadingState title="Loading mobile queue" /> : null}
      {workflow.isError ? (
        <ErrorNotice title="Unable to load mobile companion" body="The API request failed. Confirm the API server is running." />
      ) : null}
      {workflow.data ? <CompanionBody data={workflow.data} profile={profile.data} profileLoading={profile.isLoading} /> : null}
    </AppShell>
  );
}

function CompanionBody({
  data,
  profile,
  profileLoading,
}: {
  data: DailyWorkflowData;
  profile?: UserProfile;
  profileLoading: boolean;
}) {
  const actions = useCompanionActions();
  const todayQueue = useMemo(() => buildTodayQueue(data), [data]);

  return (
    <>
      <div className="mx-auto grid max-w-[34rem] gap-4 pb-24 lg:max-w-none lg:grid-cols-[minmax(0,34rem)_1fr] xl:grid-cols-[minmax(0,34rem)_minmax(0,1fr)_24rem]">
        <div className="grid content-start gap-4">
          <MobileHero data={data} />
          <NotificationPanel data={data} queueCount={todayQueue.length} />
          <QueuePanel items={todayQueue} actions={actions} />
        </div>

        <div className="grid content-start gap-4">
          <ExpiringPanel items={data.expiringSoon} actions={actions} />
          <WinnerAlertsPanel alerts={data.winnerVerificationEmails} actions={actions} />
          <RiskReviewPanel data={data} actions={actions} />
        </div>

        <div className="grid content-start gap-4 lg:col-span-2 xl:col-span-1">
          {profile ? <ProfilePanel profile={profile} actions={actions} /> : profileLoading ? <ProfileSkeleton /> : <ProfileError />}
          <SafetyPanel />
        </div>
      </div>

      <MobileDock />
    </>
  );
}

function MobileHero({ data }: { data: DailyWorkflowData }) {
  return (
    <section className="overflow-hidden rounded-md border border-accent/25 bg-[linear-gradient(150deg,rgba(82,211,170,0.16),rgba(20,25,27,0.98)_54%)] p-4 shadow-sm shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-accent">
            <Smartphone size={15} aria-hidden="true" />
            SweepScout PWA
          </div>
          <h2 className="mt-3 text-2xl font-semibold leading-tight text-foreground">Today</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Queue, inbox, deadlines, and risk decisions are ready for manual review.
          </p>
        </div>
        <Badge tone="ok">{formatDate(data.generatedAt)}</Badge>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <MiniStat label="Queue" value={data.stats.todaysRepeatableCount + data.stats.newEligibleCount} />
        <MiniStat label="Expires" value={data.stats.expiringSoonCount} />
        <MiniStat label="Alerts" value={data.stats.winnerVerificationCount + data.stats.suspiciousDecisionCount} />
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-line bg-background/55 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function NotificationPanel({ data, queueCount }: { data: DailyWorkflowData; queueCount: number }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => readNotificationPrefs());
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [status, setStatus] = useState<string>("Notifications not enabled yet.");
  const notificationSupported = typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function updatePrefs(next: NotificationPrefs) {
    setPrefs(next);
    writeNotificationPrefs(next);
  }

  async function installApp() {
    if (!installPrompt) {
      setStatus("Use your browser menu to add SweepScout to the home screen.");
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setStatus(choice.outcome === "accepted" ? "Install accepted." : "Install dismissed.");
  }

  async function syncNotifications() {
    const payloads = buildNotificationPayloads(data, queueCount, prefs);
    if (!payloads.length) {
      try {
        await showPwaNotification({
          title: "SweepScout reminders enabled",
          body: "Mobile notifications are ready. No active reminders right now.",
          tag: "sweepscout-notifications-ready",
          url: "/dashboard/mobile",
        });
        setStatus("Notifications enabled. No active reminders right now.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Unable to enable notifications.");
      }
      return;
    }

    try {
      for (const payload of payloads) {
        await showPwaNotification(payload);
      }
      setStatus(`Synced ${payloads.length} mobile reminder${payloads.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to enable notifications.");
    }
  }

  return (
    <Panel id="notifications" className="grid gap-4">
      <SectionHeader
        title="Push Notifications"
        eyebrow="PWA reminders"
        action={<Badge tone={notificationSupported ? "ok" : "warn"}>{notificationSupported ? "Supported" : "Unsupported"}</Badge>}
      />

      <div className="grid gap-2">
        <ToggleRow
          label="Daily queue"
          checked={prefs.dailyQueue}
          onChange={(checked) => updatePrefs({ ...prefs, dailyQueue: checked })}
        />
        <ToggleRow
          label="Winner emails"
          checked={prefs.winnerAlerts}
          onChange={(checked) => updatePrefs({ ...prefs, winnerAlerts: checked })}
        />
        <ToggleRow
          label="Expiring soon"
          checked={prefs.expiringSoon}
          onChange={(checked) => updatePrefs({ ...prefs, expiringSoon: checked })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button className={actionButtonClass("secondary")} type="button" onClick={installApp}>
          <Smartphone size={16} aria-hidden="true" /> Install
        </button>
        <button className={actionButtonClass("primary")} type="button" onClick={syncNotifications} disabled={!notificationSupported}>
          <BellRing size={16} aria-hidden="true" /> Enable Push
        </button>
      </div>
      <p className="text-xs leading-5 text-muted">{status}</p>
    </Panel>
  );
}

function ToggleRow(props: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-line bg-panel-strong px-3 text-sm text-foreground">
      <span>{props.label}</span>
      <input
        type="checkbox"
        className="h-5 w-5 accent-accent"
        checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
      />
    </label>
  );
}

function QueuePanel({ items, actions }: { items: MobileQueueItem[]; actions: CompanionActions }) {
  return (
    <Panel id="queue">
      <SectionHeader title="Daily Entry Queue" eyebrow="Ready for manual action" />
      <div className="grid gap-3">
        {items.length ? (
          items.map((item) => <SweepstakeMobileCard key={item.id} item={item} actions={actions} />)
        ) : (
          <EmptyState title="Queue is clear" body="Repeatable and newly eligible sweepstakes will appear here when they are ready." />
        )}
      </div>
    </Panel>
  );
}

function ExpiringPanel({ items, actions }: { items: DailyWorkflowData["expiringSoon"]; actions: CompanionActions }) {
  return (
    <Panel id="expiring">
      <SectionHeader title="Expiring Soon" eyebrow="48-hour reminders" />
      <div className="grid gap-3">
        {items.length ? (
          items.map((item) => (
            <SweepstakeMobileCard
              key={item.sweepstake.id}
              item={{
                id: `expiring-${item.sweepstake.id}`,
                sweepstake: item.sweepstake,
                label: deadlineLabel(item.sweepstake.endAt),
                detail: item.blockedReason ?? item.frequencyLabel,
                canSubmit: item.canEnter,
                blockedReason: item.blockedReason,
              }}
              actions={actions}
            />
          ))
        ) : (
          <EmptyState title="No urgent deadlines" body="Eligible sweepstakes with near deadlines appear here for quick review." />
        )}
      </div>
    </Panel>
  );
}

function WinnerAlertsPanel({ alerts, actions }: { alerts: InboxAlert[]; actions: CompanionActions }) {
  return (
    <Panel id="alerts">
      <SectionHeader title="Winner Email Alerts" eyebrow="Review before links" />
      <div className="grid gap-3">
        {alerts.length ? (
          alerts.map((alert) => <InboxMobileCard key={alert.id} alert={alert} actions={actions} />)
        ) : (
          <EmptyState title="No winner emails pending" body="Winner, verification, and confirmation emails appear here after inbox monitoring flags them." />
        )}
      </div>
    </Panel>
  );
}

function RiskReviewPanel({ data, actions }: { data: DailyWorkflowData; actions: CompanionActions }) {
  const hasItems = data.suspiciousItems.length > 0 || data.suspiciousInboxAlerts.length > 0;

  return (
    <Panel id="risk">
      <SectionHeader title="Quick Risk Review" eyebrow="Phishing, spam, and rejected items" />
      <div className="grid gap-3">
        {data.suspiciousItems.map((item) => (
          <RiskSweepstakeCard key={item.sweepstake.id} item={item} actions={actions} />
        ))}
        {data.suspiciousInboxAlerts.map((alert) => (
          <InboxMobileCard key={alert.id} alert={alert} actions={actions} suspicious />
        ))}
        {!hasItems ? <EmptyState title="No risk decisions pending" body="Suspicious sweepstakes and inbox alerts will collect here for review." /> : null}
      </div>
    </Panel>
  );
}

function SweepstakeMobileCard({
  item,
  actions,
}: {
  item: MobileQueueItem;
  actions: CompanionActions;
}) {
  const submitBlocked =
    !item.canSubmit || item.sweepstake.purchaseRequired || item.sweepstake.noPurchaseMethodFound || item.sweepstake.status === "expired";
  const statusPending = actions.status.isPending;

  return (
    <article className="rounded-md border border-line bg-panel-strong p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={deadlineTone(item.sweepstake.endAt)}>{item.label}</Badge>
            <Badge tone={item.sweepstake.scamScore >= 60 ? "danger" : item.sweepstake.scamScore >= 40 ? "warn" : "ok"}>
              Risk {item.sweepstake.scamScore}
            </Badge>
          </div>
          <h3 className="mt-2 line-clamp-2 text-base font-semibold leading-snug text-foreground">{item.sweepstake.title}</h3>
          <p className="mt-1 text-xs leading-5 text-muted">
            {item.sweepstake.sponsor} | {categoryLabel(item.sweepstake.category)} | {formatCurrency(item.sweepstake.prizeRetailValue)}
          </p>
        </div>
        <div className="shrink-0 text-right text-xs text-muted">
          <p>Elig.</p>
          <p className="text-lg font-semibold text-foreground">{item.sweepstake.eligibilityScore}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs leading-5 text-muted">
        <InlineFact icon={<Clock3 size={14} aria-hidden="true" />} text={item.detail} />
        {item.sweepstake.localRegion ? <InlineFact icon={<MapPin size={14} aria-hidden="true" />} text={item.sweepstake.localRegion} /> : null}
        {item.blockedReason ? <InlineFact icon={<ShieldAlert size={14} aria-hidden="true" />} text={item.blockedReason} tone="warn" /> : null}
        {item.sweepstake.purchaseRequired || item.sweepstake.noPurchaseMethodFound ? (
          <InlineFact icon={<AlertTriangle size={14} aria-hidden="true" />} text="Submission logging blocked by purchase/no-purchase safety rule." tone="danger" />
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          className={actionButtonClass("primary")}
          type="button"
          disabled={statusPending || submitBlocked}
          onClick={() => actions.markSubmitted(item.sweepstake)}
        >
          <CheckCircle2 size={16} aria-hidden="true" /> Submitted
        </button>
        <button
          className={actionButtonClass("secondary")}
          type="button"
          disabled={statusPending}
          onClick={() => actions.markSkipped(item.sweepstake)}
        >
          <SkipForward size={16} aria-hidden="true" /> Skip
        </button>
        <button
          className={actionButtonClass("secondary")}
          type="button"
          disabled={statusPending}
          onClick={() => actions.markSuspicious(item.sweepstake)}
        >
          <ShieldAlert size={16} aria-hidden="true" /> Risk
        </button>
        <button
          className={actionButtonClass("danger")}
          type="button"
          disabled={actions.blockDomain.isPending}
          onClick={() => actions.blockSponsor(item.sweepstake)}
        >
          <Ban size={16} aria-hidden="true" /> Block
        </button>
      </div>
      {actions.status.error ? <p className="mt-3 text-xs text-danger">{actions.status.error.message}</p> : null}
      {actions.blockDomain.error ? <p className="mt-3 text-xs text-danger">{actions.blockDomain.error.message}</p> : null}
    </article>
  );
}

function RiskSweepstakeCard({
  item,
  actions,
}: {
  item: DailyWorkflowData["suspiciousItems"][number];
  actions: CompanionActions;
}) {
  return (
    <article className="rounded-md border border-warning/35 bg-warning/10 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 shrink-0 text-warning" size={17} aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-semibold text-foreground">{item.sweepstake.title}</h3>
          <p className="mt-1 text-xs leading-5 text-muted">{item.reason}</p>
          {item.latestEntry ? (
            <p className="mt-1 text-xs text-muted">
              Latest decision: {titleCase(item.latestEntry.status)} on {formatDate(item.latestEntry.attemptedAt)}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button className={actionButtonClass("secondary")} type="button" onClick={() => actions.markSuspicious(item.sweepstake)}>
          <ShieldAlert size={16} aria-hidden="true" /> Keep
        </button>
        <button className={actionButtonClass("secondary")} type="button" onClick={() => actions.markSkipped(item.sweepstake)}>
          <SkipForward size={16} aria-hidden="true" /> Skip
        </button>
        <button className={actionButtonClass("danger")} type="button" onClick={() => actions.blockSponsor(item.sweepstake)}>
          <Ban size={16} aria-hidden="true" /> Block
        </button>
      </div>
    </article>
  );
}

function InboxMobileCard({ alert, actions, suspicious = false }: { alert: InboxAlert; actions: CompanionActions; suspicious?: boolean }) {
  const tone = alert.severity === "danger" ? "danger" : alert.severity === "warn" ? "warn" : "default";

  return (
    <article className="rounded-md border border-line bg-panel-strong p-3">
      <div className="flex items-start gap-2">
        {suspicious ? (
          <AlertTriangle className="mt-0.5 shrink-0 text-warning" size={17} aria-hidden="true" />
        ) : (
          <MailWarning className="mt-0.5 shrink-0 text-accent" size={17} aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={tone}>{titleCase(alert.severity)}</Badge>
            {alert.categories.slice(0, 2).map((category) => (
              <Badge key={category} tone={category === "phishing_risk" ? "danger" : category === "winner_notification" ? "warn" : "default"}>
                {titleCase(category)}
              </Badge>
            ))}
          </div>
          <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-foreground">{alert.subject}</h3>
          <p className="mt-1 text-xs leading-5 text-muted">
            {alert.fromEmail ?? "Unknown sender"} | {formatDate(alert.receivedAt)}
          </p>
          {alert.matchedSweepstakeTitle ? <p className="mt-1 text-xs text-accent">Matched: {alert.matchedSweepstakeTitle}</p> : null}
        </div>
      </div>

      <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted">{alert.snippet}</p>
      <div className="mt-3 rounded-md border border-warning/35 bg-warning/10 p-2 text-xs leading-5 text-warning">
        Verification, confirmation, and claim links require user review before opening.
      </div>
      {alert.links.length ? (
        <div className="mt-3 grid gap-1 text-xs text-muted">
          {alert.links.slice(0, 3).map((link) => (
            <p key={link.url} className="truncate">
              {titleCase(link.kind)} link held: {link.domain ?? "unknown domain"}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className={actionButtonClass("primary")} type="button" onClick={() => actions.reviewAlert(alert, "reviewed")}>
          <CheckCircle2 size={16} aria-hidden="true" /> Reviewed
        </button>
        <button className={actionButtonClass("secondary")} type="button" onClick={() => actions.reviewAlert(alert, "dismissed")}>
          <SkipForward size={16} aria-hidden="true" /> Dismiss
        </button>
      </div>
      {actions.reviewInbox.error ? <p className="mt-3 text-xs text-danger">{actions.reviewInbox.error.message}</p> : null}
    </article>
  );
}

function ProfilePanel({ profile, actions }: { profile: UserProfile; actions: CompanionActions }) {
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    actions.saveProfile.mutate({
      email: profile.email,
      alternateEmail: profile.alternateEmail,
      firstName: profile.firstName,
      lastName: profile.lastName,
      dob: profile.dob,
      phone: profile.phone,
      address1: profile.address1,
      address2: profile.address2,
      city: String(form.get("city") ?? profile.city),
      state: String(form.get("state") ?? profile.state),
      postalCode: profile.postalCode,
      country: profile.country,
      consentToPrefill: profile.consentToPrefill,
      prefillConfirmation: profile.consentToPrefill,
      categories: String(form.get("categories") ?? profile.preferences.categories.join(", ")),
      nearbyMetros: String(form.get("nearbyMetros") ?? profile.preferences.nearbyMetros.join(", ")),
      maxDailyEntries: Number(form.get("maxDailyEntries") ?? profile.preferences.maxDailyEntries),
      avoidPurchaseRequired: form.has("avoidPurchaseRequired"),
      allowSocialActions: form.has("allowSocialActions"),
      allowInPersonContests: form.has("allowInPersonContests"),
    });
  }

  return (
    <Panel id="profile">
      <SectionHeader
        title="Profile Settings"
        eyebrow={profile.email}
        action={<Link href="/vault" className="text-sm text-accent">Full vault</Link>}
      />
      <form className="grid gap-3" onSubmit={onSubmit}>
        <Field label="City">
          <TextInput name="city" defaultValue={profile.city} autoComplete="address-level2" />
        </Field>
        <Field label="State">
          <TextInput name="state" defaultValue={profile.state} autoComplete="address-level1" />
        </Field>
        <Field label="Nearby metros">
          <TextInput name="nearbyMetros" defaultValue={profile.preferences.nearbyMetros.join(", ")} />
        </Field>
        <Field label="Category priority">
          <TextInput name="categories" defaultValue={profile.preferences.categories.join(", ")} />
        </Field>
        <Field label="Daily entry cap">
          <TextInput name="maxDailyEntries" type="number" min={1} max={100} defaultValue={profile.preferences.maxDailyEntries} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" name="avoidPurchaseRequired" className="h-4 w-4 accent-accent" defaultChecked={profile.preferences.avoidPurchaseRequired} />
          Avoid purchase-required
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" name="allowSocialActions" className="h-4 w-4 accent-accent" defaultChecked={profile.preferences.allowSocialActions} />
          Allow social actions
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" name="allowInPersonContests" className="h-4 w-4 accent-accent" defaultChecked={profile.preferences.allowInPersonContests} />
          Allow in-person contests
        </label>
        <button className={actionButtonClass("primary")} type="submit" disabled={actions.saveProfile.isPending}>
          <UserRound size={16} aria-hidden="true" /> Save Profile
        </button>
        {actions.saveProfile.error ? <p className="text-xs text-danger">{actions.saveProfile.error.message}</p> : null}
        {actions.saveProfile.data ? <p className="text-xs text-ok">Profile updated.</p> : null}
      </form>
    </Panel>
  );
}

function SafetyPanel() {
  return (
    <Panel className="border-accent/20 bg-[linear-gradient(180deg,rgba(82,211,170,0.08),rgba(20,25,27,0.98))]">
      <SectionHeader title="Safety Locks" eyebrow="Always on" />
      <div className="grid gap-3 text-sm leading-6 text-muted">
        <InlineFact icon={<CheckCircle2 size={15} aria-hidden="true" />} text="Manual approval required for every submission." tone="ok" />
        <InlineFact icon={<ShieldAlert size={15} aria-hidden="true" />} text="No CAPTCHA bypass, auto-submit, payment, or SSN handling." tone="warn" />
        <InlineFact icon={<MailWarning size={15} aria-hidden="true" />} text="Verification and claim links are never auto-opened." />
      </div>
    </Panel>
  );
}

function ProfileSkeleton() {
  return (
    <Panel>
      <div className="flex items-center gap-2 text-sm text-muted">
        <RefreshCw className="animate-spin text-accent" size={16} aria-hidden="true" />
        Loading profile settings
      </div>
    </Panel>
  );
}

function ProfileError() {
  return (
    <Panel>
      <p className="text-sm text-danger">Profile settings could not be loaded.</p>
    </Panel>
  );
}

function MobileDock() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-background/95 px-3 py-2 backdrop-blur lg:hidden" aria-label="Mobile companion sections">
      <div className="mx-auto grid max-w-[34rem] grid-cols-5 gap-1">
        <DockLink href="#queue" icon={<CheckCircle2 size={17} aria-hidden="true" />} label="Queue" />
        <DockLink href="#expiring" icon={<Clock3 size={17} aria-hidden="true" />} label="Due" />
        <DockLink href="#alerts" icon={<Trophy size={17} aria-hidden="true" />} label="Wins" />
        <DockLink href="#risk" icon={<ShieldAlert size={17} aria-hidden="true" />} label="Risk" />
        <DockLink href="#profile" icon={<UserRound size={17} aria-hidden="true" />} label="Profile" />
      </div>
    </nav>
  );
}

function DockLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <a href={href} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-medium text-muted hover:bg-panel hover:text-foreground">
      {icon}
      {label}
    </a>
  );
}

function InlineFact({ icon, text, tone }: { icon: ReactNode; text: string; tone?: "ok" | "warn" | "danger" }) {
  return (
    <div className={tone === "ok" ? "flex items-start gap-2 text-ok" : tone === "warn" ? "flex items-start gap-2 text-warning" : tone === "danger" ? "flex items-start gap-2 text-danger" : "flex items-start gap-2"}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

type CompanionActions = ReturnType<typeof useCompanionActions>;

function useCompanionActions() {
  const queryClient = useQueryClient();
  const refresh = async () => queryClient.invalidateQueries();

  const status = useMutation({
    mutationFn: (body: StatusPayload) => apiSend<EntryLog>("/entries/status", "POST", body),
    onSuccess: refresh,
  });

  const reviewInbox = useMutation({
    mutationFn: (input: { id: string; status: "reviewed" | "dismissed"; notes: string }) =>
      apiSend<InboxAlert>(`/inbox/alerts/${input.id}/review`, "POST", { status: input.status, notes: input.notes }),
    onSuccess: refresh,
  });

  const blockDomain = useMutation({
    mutationFn: (input: { sweepstake: Sweepstake; reason: string }) =>
      apiSend(`/sweepstakes/${input.sweepstake.id}/block-domain`, "POST", { reason: input.reason }),
    onSuccess: refresh,
  });

  const saveProfile = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiSend<UserProfile>("/profile", "PUT", body),
    onSuccess: refresh,
  });

  return {
    status,
    reviewInbox,
    blockDomain,
    saveProfile,
    markSubmitted(sweepstake: Sweepstake) {
      status.mutate({
        sweepstakeId: sweepstake.id,
        status: "submitted",
        userApproved: true,
        reviewConfirmed: true,
        purchaseRequiredAcknowledged: false,
        timeSpentMinutes: 2,
        notes: "Marked submitted from the mobile PWA after manual user review.",
      });
    },
    markSkipped(sweepstake: Sweepstake) {
      status.mutate({
        sweepstakeId: sweepstake.id,
        status: "skipped",
        userApproved: false,
        reviewConfirmed: true,
        purchaseRequiredAcknowledged: false,
        timeSpentMinutes: 1,
        notes: "Skipped from the mobile PWA after user review.",
      });
    },
    markSuspicious(sweepstake: Sweepstake) {
      status.mutate({
        sweepstakeId: sweepstake.id,
        status: "suspicious",
        userApproved: false,
        reviewConfirmed: true,
        purchaseRequiredAcknowledged: false,
        timeSpentMinutes: 1,
        notes: "Flagged during mobile PWA risk review.",
      });
    },
    blockSponsor(sweepstake: Sweepstake) {
      blockDomain.mutate({
        sweepstake,
        reason: `Blocked from the mobile PWA after reviewing ${sweepstake.title}.`,
      });
    },
    reviewAlert(alert: InboxAlert, nextStatus: "reviewed" | "dismissed") {
      reviewInbox.mutate({
        id: alert.id,
        status: nextStatus,
        notes: nextStatus === "reviewed"
          ? "Reviewed from the mobile PWA. SweepScout did not open any links."
          : "Dismissed from the mobile PWA after user review.",
      });
    },
  };
}

function buildTodayQueue(data: DailyWorkflowData): MobileQueueItem[] {
  const seen = new Set<string>();
  const items: MobileQueueItem[] = [];

  for (const item of data.todaysRepeatableEntries) {
    if (seen.has(item.sweepstake.id)) continue;
    seen.add(item.sweepstake.id);
    items.push({
      id: `repeatable-${item.sweepstake.id}`,
      sweepstake: item.sweepstake,
      label: item.frequencyLabel,
      detail: item.lastSubmittedAt ? `Last submitted ${formatDate(item.lastSubmittedAt)}` : "Ready today",
      canSubmit: item.canEnter,
      blockedReason: item.blockedReason,
    });
  }

  for (const sweepstake of data.newEligibleSweepstakes) {
    if (seen.has(sweepstake.id)) continue;
    seen.add(sweepstake.id);
    items.push({
      id: `new-${sweepstake.id}`,
      sweepstake,
      label: "New",
      detail: "No entry logged yet",
      canSubmit: true,
      blockedReason: null,
    });
  }

  return items;
}

function buildNotificationPayloads(data: DailyWorkflowData, queueCount: number, prefs: NotificationPrefs): PwaNotificationPayload[] {
  const payloads: PwaNotificationPayload[] = [];
  if (prefs.dailyQueue && queueCount > 0) {
    payloads.push({
      title: "SweepScout daily queue",
      body: `${queueCount} eligible entr${queueCount === 1 ? "y" : "ies"} ready for review.`,
      tag: "sweepscout-daily-queue",
      url: "/dashboard/mobile#queue",
    });
  }
  if (prefs.winnerAlerts && data.winnerVerificationEmails.length > 0) {
    payloads.push({
      title: "Winner email review",
      body: `${data.winnerVerificationEmails.length} winner or verification email${data.winnerVerificationEmails.length === 1 ? "" : "s"} need review.`,
      tag: "sweepscout-winner-alerts",
      url: "/dashboard/mobile#alerts",
    });
  }
  if (prefs.expiringSoon && data.expiringSoon.length > 0) {
    payloads.push({
      title: "Sweepstakes expiring soon",
      body: `${data.expiringSoon.length} tracked sweepstakes expire soon.`,
      tag: "sweepscout-expiring-soon",
      url: "/dashboard/mobile#expiring",
    });
  }
  return payloads;
}

function readNotificationPrefs(): NotificationPrefs {
  try {
    const raw = window.localStorage.getItem(prefsKey);
    if (!raw) return defaultPrefs;
    return { ...defaultPrefs, ...(JSON.parse(raw) as Partial<NotificationPrefs>) };
  } catch {
    return defaultPrefs;
  }
}

function writeNotificationPrefs(prefs: NotificationPrefs) {
  try {
    window.localStorage.setItem(prefsKey, JSON.stringify(prefs));
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

function actionButtonClass(tone: "primary" | "secondary" | "danger") {
  const base = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-55";
  if (tone === "primary") return `${base} bg-accent text-[#08110e] hover:brightness-110`;
  if (tone === "danger") return `${base} bg-danger/15 text-danger hover:bg-danger/20`;
  return `${base} border border-line bg-panel text-foreground hover:border-accent/50`;
}

function deadlineLabel(value: string | null) {
  if (!value) return "No deadline";
  const deadline = new Date(value);
  const delta = deadline.getTime() - Date.now();
  if (!Number.isFinite(delta)) return "No deadline";
  if (delta <= 0) return "Expired";
  const hours = Math.ceil(delta / (60 * 60 * 1000));
  if (hours <= 48) return `${hours}h left`;
  return `Ends ${formatDate(value)}`;
}

function deadlineTone(value: string | null): "default" | "ok" | "warn" | "danger" {
  if (!value) return "default";
  const delta = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(delta) || delta < 0) return "danger";
  if (delta <= 48 * 60 * 60 * 1000) return "danger";
  if (delta <= 7 * 24 * 60 * 60 * 1000) return "warn";
  return "default";
}
