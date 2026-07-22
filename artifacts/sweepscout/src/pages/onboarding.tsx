import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { PlaneTakeoff, ShieldCheck } from "lucide-react";
import { apiSend, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const prizeCategories = ["Cash", "Travel", "Tech", "Gaming", "Vehicles", "Home", "Gift cards", "Experiences"];

export default function OnboardingPage() {
  const { session, refresh } = useAuth();
  const [, navigate] = useLocation();
  const [displayName, setDisplayName] = useState(session?.user.displayName ?? "");
  const [countryCode, setCountryCode] = useState("US");
  const [stateOrRegion, setStateOrRegion] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [minimumPrizeValue, setMinimumPrizeValue] = useState("25");
  const [maximumEntryEffort, setMaximumEntryEffort] = useState("60");
  const [categories, setCategories] = useState<string[]>(["Cash", "Tech"]);
  const [emailDigestFrequency, setEmailDigestFrequency] = useState<"never" | "daily" | "weekly">("weekly");
  const [minimumAgeConfirmed, setMinimumAgeConfirmed] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptSponsorDisclaimer, setAcceptSponsorDisclaimer] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await apiSend("/auth/onboarding", "PUT", {
        displayName,
        countryCode,
        stateOrRegion,
        birthDate,
        minimumPrizeValue: Number(minimumPrizeValue),
        maximumEntryEffort: Number(maximumEntryEffort),
        preferredCategories: categories,
        emailDigestFrequency,
        minimumAgeConfirmed,
        acceptTerms,
        acceptPrivacy,
        acceptSponsorDisclaimer,
      });
      await refresh();
      navigate("/dashboard", { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to save onboarding preferences.");
    } finally {
      setBusy(false);
    }
  }

  function toggleCategory(category: string) {
    setCategories((current) => current.includes(category) ? current.filter((value) => value !== category) : [...current, category]);
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-8 text-foreground sm:px-6">
      <form onSubmit={submit} className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-line bg-panel shadow-[var(--shadow-soft)]">
        <header className="border-b border-line bg-[linear-gradient(135deg,rgba(37,99,235,0.22),rgba(124,58,237,0.13),transparent)] p-6 sm:p-8">
          <div className="flex items-center gap-4"><img src="/brand/play-pack-pilot-logo-original.png" alt="" className="h-20 w-28 object-contain" /><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Preflight setup</p><h1 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">Tune your opportunity radar</h1></div></div>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">These private details help filter promotions you can actually enter. Your full birth date stays in your private profile and is never included in public listings.</p>
        </header>
        <div className="grid gap-7 p-6 sm:p-8">
          <section className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name" value={displayName} onChange={setDisplayName} />
            <Field label="Birth date" type="date" value={birthDate} onChange={setBirthDate} />
            <Field label="Country code" value={countryCode} onChange={setCountryCode} maxLength={2} />
            <Field label="State or region" value={stateOrRegion} onChange={setStateOrRegion} />
          </section>
          <section>
            <h2 className="font-display text-lg font-bold">Prize interests</h2>
            <div className="mt-3 flex flex-wrap gap-2">{prizeCategories.map((category) => <button key={category} type="button" onClick={() => toggleCategory(category)} className={`rounded-full border px-3 py-2 text-sm transition ${categories.includes(category) ? "border-accent bg-accent/15 text-accent" : "border-line bg-panel-strong text-muted hover:text-foreground"}`}>{category}</button>)}</div>
          </section>
          <section className="grid gap-4 sm:grid-cols-3">
            <Field label="Minimum prize value ($)" type="number" value={minimumPrizeValue} onChange={setMinimumPrizeValue} min="0" />
            <Field label="Maximum entry effort (0–100)" type="number" value={maximumEntryEffort} onChange={setMaximumEntryEffort} min="0" max="100" />
            <label className="grid gap-1.5 text-sm font-medium"><span>Email digest</span><select value={emailDigestFrequency} onChange={(event) => setEmailDigestFrequency(event.currentTarget.value as typeof emailDigestFrequency)} className="h-11 rounded-lg border border-line bg-panel-strong px-3"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="never">Never</option></select></label>
          </section>
          <section className="grid gap-3 rounded-xl border border-line bg-panel-strong p-4 text-sm">
            <Check label="I confirm I meet the minimum age requirements for promotions I choose to enter." checked={minimumAgeConfirmed} onChange={setMinimumAgeConfirmed} />
            <Check label="I agree to the Terms of Service." checked={acceptTerms} onChange={setAcceptTerms} />
            <Check label="I agree to the Privacy Policy." checked={acceptPrivacy} onChange={setAcceptPrivacy} />
            <Check label="I understand Play Pack Pilot is a discovery and organization service—not the sponsor or administrator of listed promotions." checked={acceptSponsorDisclaimer} onChange={setAcceptSponsorDisclaimer} />
          </section>
          {error ? <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p> : null}
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center"><p className="max-w-xl text-xs leading-5 text-muted"><ShieldCheck size={14} className="mr-1 inline" /> Eligibility data is private and only used to personalize your results.</p><button disabled={busy || !minimumAgeConfirmed || !acceptTerms || !acceptPrivacy || !acceptSponsorDisclaimer} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-5 font-semibold text-accent-foreground disabled:opacity-50"><PlaneTakeoff size={18} />{busy ? "Saving…" : "Launch my flight deck"}</button></div>
        </div>
      </form>
    </main>
  );
}

function Field({ label, value, onChange, type = "text", ...rest }: { label: string; value: string; onChange: (value: string) => void; type?: string; min?: string; max?: string; maxLength?: number }) {
  return <label className="grid gap-1.5 text-sm font-medium"><span>{label}</span><input required type={type} value={value} onChange={(event) => onChange(event.currentTarget.value)} className="h-11 rounded-lg border border-line bg-panel-strong px-3 outline-none focus:border-accent" {...rest} /></label>;
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-start gap-3"><input required type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} className="mt-1 size-4 accent-[var(--accent)]" /><span className="leading-6 text-muted">{label}</span></label>;
}
