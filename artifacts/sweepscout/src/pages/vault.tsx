import type { ReactNode } from "react";
import { AlertTriangle, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { ErrorNotice, LoadingState } from "@/components/dashboard-kit";
import { Badge, Checkbox, PageHeader, Panel, SubmitButton, TextInput } from "@/components/ui";
import { apiGet } from "@/lib/api";
import { formToObject, useApiMutation } from "@/lib/forms";
import type { UserProfile } from "@/lib/types";

const profileVaultWarning =
  "SweepScout only stores the profile fields shown here. Never enter Social Security numbers, banking details, payment cards, or other sensitive financial credentials — they are intentionally unsupported.";

export default function VaultPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["profile"], queryFn: () => apiGet<UserProfile>("/profile") });

  return (
    <AppShell>
      <PageHeader title="Secure Profile Vault" kicker={data?.email ?? "Loading vault"}>
        <Badge tone={data?.consentToPrefill ? "ok" : "warn"}>{data?.consentToPrefill ? "Prefill consent enabled" : "Prefill consent off"}</Badge>
        <Badge tone="ok">Manual approval locked</Badge>
      </PageHeader>
      {isLoading ? <LoadingState /> : null}
      {isError ? <ErrorNotice title="Unable to load vault" body="The API request failed. Confirm the API server is running." /> : null}
      {data ? <VaultBody profile={data} /> : null}
    </AppShell>
  );
}

function VaultBody({ profile }: { profile: UserProfile }) {
  const save = useApiMutation("/profile", { method: "PUT" });
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_0.42fr]">
      <Panel>
        <form
          className="grid gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(formToObject(event.currentTarget));
          }}
        >
          <div className="rounded-md border border-warning/35 bg-warning/10 p-4 text-sm text-foreground">
            <div className="mb-2 flex items-center gap-2 font-semibold text-warning">
              <AlertTriangle size={16} aria-hidden />
              Sensitive data boundary
            </div>
            <p className="text-muted">{profileVaultWarning}</p>
          </div>

          <section className="grid gap-3">
            <SectionHeading icon={<ShieldCheck size={18} aria-hidden />} title="Legal identity" />
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Legal first name">
                <TextInput name="firstName" defaultValue={profile.firstName} autoComplete="given-name" required />
              </Field>
              <Field label="Legal last name">
                <TextInput name="lastName" defaultValue={profile.lastName} autoComplete="family-name" required />
              </Field>
              <Field label="Primary email">
                <TextInput name="email" type="email" defaultValue={profile.email} autoComplete="email" required />
              </Field>
              <Field label="Alternate email" hint="Optional. Used only for your own tracking and manual review.">
                <TextInput name="alternateEmail" type="email" defaultValue={profile.alternateEmail} autoComplete="email" />
              </Field>
            </div>
          </section>

          <details className="rounded-md border border-line bg-panel-strong p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground">
              <span className="flex items-center gap-2">
                <EyeOff size={18} aria-hidden />
                Sensitive contact details hidden by default
              </span>
              <span className="text-xs font-medium text-muted">Open to edit</span>
            </summary>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field label="Phone">
                <TextInput name="phone" type="tel" defaultValue={profile.phone} autoComplete="tel" />
              </Field>
              <Field label="Date of birth">
                <TextInput name="dob" type="date" defaultValue={profile.dob} autoComplete="bday" required />
              </Field>
              <Field label="Address line 1">
                <TextInput name="address1" defaultValue={profile.address1} autoComplete="address-line1" />
              </Field>
              <Field label="Address line 2">
                <TextInput name="address2" defaultValue={profile.address2} autoComplete="address-line2" />
              </Field>
              <Field label="City">
                <TextInput name="city" defaultValue={profile.city} autoComplete="address-level2" />
              </Field>
              <Field label="State">
                <TextInput name="state" defaultValue={profile.state} autoComplete="address-level1" required />
              </Field>
              <Field label="Postal code">
                <TextInput name="postalCode" defaultValue={profile.postalCode} autoComplete="postal-code" />
              </Field>
              <Field label="Country">
                <TextInput name="country" defaultValue={profile.country} autoComplete="country" required />
              </Field>
            </div>
          </details>

          <section className="grid gap-3">
            <SectionHeading icon={<LockKeyhole size={18} aria-hidden />} title="Preferences and consent" />
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Preferred sweepstakes categories" hint="Comma separated, for discovery and scoring filters.">
                <TextInput name="categories" defaultValue={profile.preferences.categories.join(", ")} />
              </Field>
              <Field label="Max daily entries">
                <TextInput name="maxDailyEntries" type="number" min={1} max={100} defaultValue={profile.preferences.maxDailyEntries} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-4">
              <Checkbox name="avoidPurchaseRequired" label="Avoid purchase-required promotions" defaultChecked={profile.preferences.avoidPurchaseRequired} />
              <Checkbox name="allowSocialActions" label="Allow sweepstakes that require social actions" defaultChecked={profile.preferences.allowSocialActions} />
            </div>
            <div className="rounded-md border border-line bg-panel-strong p-4">
              <Checkbox name="consentToPrefill" label="Enable form prefill from this vault" defaultChecked={profile.consentToPrefill} />
              <p className="mt-2 text-sm text-muted">
                Prefill only fills mapped profile fields. SweepScout still stops before submit, leaves terms unchecked, and requires manual review.
              </p>
              {!profile.consentToPrefill ? (
                <div className="mt-4">
                  <Checkbox name="prefillConfirmation" label="I confirm I want to enable prefill and will review every entry manually" />
                </div>
              ) : (
                <input name="prefillConfirmation" type="hidden" value="on" />
              )}
            </div>
          </section>

          <div>
            <SubmitButton disabled={save.isPending}>Save Vault</SubmitButton>
          </div>
        </form>
      </Panel>

      <Panel className="self-start">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Vault Security</h2>
        <div className="grid gap-3 text-sm text-muted">
          <p>SSN, banking details, payment cards, and payment credentials are intentionally unsupported.</p>
          <p>Sensitive contact fields are collapsed until you choose to edit them.</p>
          <p>Assisted prefill needs vault consent, the global setting, and per-entry approval before it can run.</p>
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

function Field(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-foreground">
      <span>{props.label}</span>
      {props.children}
      {props.hint ? <span className="text-xs font-normal text-muted">{props.hint}</span> : null}
    </label>
  );
}
