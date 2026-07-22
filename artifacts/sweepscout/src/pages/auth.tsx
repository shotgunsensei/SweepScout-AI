import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle2, LockKeyhole, Mail, Plane, ShieldCheck } from "lucide-react";
import { apiGet, apiSend, ApiError } from "@/lib/api";
import { safeDestination, useAuth } from "@/lib/auth";

type AuthMode = "login" | "signup" | "forgot";

export function LoginPage() {
  return <CredentialPage mode="login" />;
}

export function SignupPage() {
  return <CredentialPage mode="signup" />;
}

export function ForgotPasswordPage() {
  return <CredentialPage mode="forgot" />;
}

function CredentialPage({ mode }: { mode: AuthMode }) {
  const { session, refresh } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState(false);
  const next = safeDestination(new URLSearchParams(window.location.search).get("next"));

  useEffect(() => {
    if (session) navigate(session.onboardingCompleted ? next : "/onboarding", { replace: true });
  }, [session, navigate, next]);

  useEffect(() => {
    apiGet<{ googleOAuthEnabled: boolean }>("/auth/config")
      .then((config) => setGoogleOAuthEnabled(config.googleOAuthEnabled))
      .catch(() => setGoogleOAuthEnabled(false));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    try {
      if (mode === "forgot") {
        const result = await apiSend<{ message: string }>("/auth/forgot-password", "POST", { email });
        setStatus(result.message);
      } else if (mode === "signup") {
        const result = await apiSend<{ message: string; verificationRequired: boolean }>("/auth/signup", "POST", { email, password, displayName });
        setStatus(result.message);
        if (!result.verificationRequired) await refresh();
      } else {
        await apiSend("/auth/login", "POST", { email, password });
        const authenticated = await refresh();
        if (authenticated) navigate(authenticated.onboardingCompleted ? next : "/onboarding", { replace: true });
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Authentication failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function googleLogin() {
    setError("");
    try {
      const result = await apiGet<{ url: string }>("/auth/oauth/google");
      window.location.assign(result.url);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Google sign-in is unavailable.");
    }
  }

  const title = mode === "login" ? "Welcome back, pilot" : mode === "signup" ? "Create your flight profile" : "Reset your password";
  const description = mode === "login" ? "Sign in to your private opportunity radar." : mode === "signup" ? "Build a personal eligibility profile and start tracking opportunities." : "We’ll send a secure recovery link if the account exists.";

  return (
    <AuthFrame>
      <div className="rounded-2xl border border-line bg-panel/95 p-6 shadow-[var(--shadow-soft)] sm:p-8">
        <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground"><Plane size={22} /></div>
        <h1 className="mt-5 font-display text-2xl font-extrabold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
        <form className="mt-6 grid gap-4" onSubmit={submit}>
          {mode === "signup" ? <Field label="Display name" value={displayName} onChange={setDisplayName} autoComplete="name" minLength={1} /> : null}
          <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" icon={<Mail size={16} />} />
          {mode !== "forgot" ? <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 12 : 1} icon={<LockKeyhole size={16} />} /> : null}
          {error ? <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p> : null}
          {status ? <p className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success" role="status">{status}</p> : null}
          <button disabled={busy} className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-accent-foreground transition hover:brightness-110 disabled:opacity-60">
            {busy ? "Working…" : mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Send recovery link"}
          </button>
        </form>
        {mode === "login" && googleOAuthEnabled ? <button type="button" onClick={googleLogin} className="mt-3 min-h-11 w-full rounded-lg border border-line bg-panel-strong px-4 text-sm font-semibold text-foreground hover:border-accent/50">Continue with Google</button> : null}
        <div className="mt-6 flex flex-wrap justify-between gap-3 text-sm text-muted">
          {mode === "login" ? <><Link href="/signup" className="text-accent hover:underline">Create account</Link><Link href="/forgot-password" className="hover:text-foreground">Forgot password?</Link></> : <Link href="/login" className="text-accent hover:underline">Back to sign in</Link>}
        </div>
      </div>
    </AuthFrame>
  );
}

export function AuthCallbackPage() {
  const { refresh } = useAuth();
  const [, navigate] = useLocation();
  const [error, setError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) {
      setError("The authentication link is incomplete or expired.");
      return;
    }
    window.history.replaceState(null, "", window.location.pathname);
    apiSend("/auth/exchange", "POST", { accessToken, refreshToken })
      .then(refresh)
      .then((session) => navigate(session?.onboardingCompleted ? "/dashboard" : "/onboarding", { replace: true }))
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : "Unable to complete authentication."));
  }, [navigate, refresh]);
  return <AuthStatus title={error ? "Authentication link failed" : "Securing your session…"} message={error || "Please wait while Play Pack Pilot verifies your credentials."} error={Boolean(error)} />;
}

export function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) {
      setError("The recovery link is incomplete or expired.");
      return;
    }
    window.history.replaceState(null, "", window.location.pathname);
    apiSend("/auth/exchange", "POST", { accessToken, refreshToken }).then(() => setReady(true)).catch((caught) => setError(caught instanceof ApiError ? caught.message : "Unable to verify the recovery link."));
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await apiSend("/auth/reset-password", "POST", { password });
      setStatus("Password updated. You can now return to your flight deck.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to reset the password.");
    }
  }
  return <AuthFrame><div className="rounded-2xl border border-line bg-panel p-7 shadow-[var(--shadow-soft)]"><h1 className="font-display text-2xl font-bold">Choose a new password</h1>{error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}{ready ? <form className="mt-5 grid gap-4" onSubmit={submit}><Field label="New password" type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={12} /><button className="min-h-11 rounded-lg bg-accent font-semibold text-accent-foreground">Update password</button></form> : null}{status ? <p className="mt-4 text-sm text-success">{status} <Link href="/login" className="underline">Sign in</Link></p> : null}</div></AuthFrame>;
}

function AuthFrame({ children }: { children: React.ReactNode }) {
  return <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-background px-4 py-10 text-foreground"><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(37,99,235,0.22),transparent_35%),radial-gradient(circle_at_80%_70%,rgba(124,58,237,0.17),transparent_38%)]" /><div className="relative w-full max-w-md"><Link href="/" className="mb-5 flex items-center justify-center"><img src="/brand/play-pack-pilot-logo-original.png" alt="Play Pack Pilot" className="h-24 w-44 object-contain" /></Link>{children}<p className="mt-5 text-center text-xs leading-5 text-muted"><ShieldCheck size={14} className="mr-1 inline" /> Credentials are handled by Supabase Auth and never stored in Play Pack Pilot tables.</p></div></main>;
}

function Field({ label, value, onChange, type = "text", autoComplete, minLength, icon }: { label: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string; minLength?: number; icon?: React.ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-medium text-foreground"><span>{label}</span><span className="flex items-center gap-2 rounded-lg border border-line bg-panel-strong px-3 focus-within:border-accent">{icon}<input required type={type} value={value} minLength={minLength} autoComplete={autoComplete} onChange={(event) => onChange(event.currentTarget.value)} className="h-11 min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" /></span></label>;
}

function AuthStatus({ title, message, error }: { title: string; message: string; error: boolean }) {
  return <AuthFrame><div className="rounded-2xl border border-line bg-panel p-8 text-center shadow-[var(--shadow-soft)]">{error ? <LockKeyhole className="mx-auto text-danger" /> : <CheckCircle2 className="mx-auto animate-pulse text-accent" />}<h1 className="mt-4 font-display text-xl font-bold">{title}</h1><p className="mt-2 text-sm leading-6 text-muted">{message}</p>{error ? <Link href="/login" className="mt-5 inline-block text-sm text-accent underline">Return to sign in</Link> : null}</div></AuthFrame>;
}
