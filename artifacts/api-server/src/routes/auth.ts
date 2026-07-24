import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  authRateLimitKey,
  clearSessionCookies,
  ensureCsrfCookie,
  getSupabasePublicClient,
  requireCsrf,
  resolveAuthContext,
  setSessionCookies,
  type AuthContext,
  AuthenticationUnavailableError,
} from "@/lib/auth/session";
import {
  ensurePersonalProfile,
  exportPersonalData,
  getPersonalProfile,
  requestAccountDeletion,
  updatePersonalProfile,
} from "@/lib/auth/profile";
import { getAppConfig } from "@/lib/env";

const router: IRouter = Router();
const emailSchema = z.string().trim().email().max(320).transform((value) => value.toLowerCase());
const passwordSchema = z.string().min(12).max(128);
const signupSchema = z.object({ email: emailSchema, password: passwordSchema, displayName: z.string().trim().min(1).max(120) });
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });

function handler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => void fn(req, res).catch(next);
}

function ok(res: Response, data: unknown, status = 200) {
  res.status(status).json({ ok: true, data });
}

function enforceRateLimit(req: Request, res: Response, scope: string, identity: string | undefined, limit: number) {
  const result = checkRateLimit(authRateLimitKey(req, scope, identity), limit, 15 * 60 * 1000);
  res.setHeader("RateLimit-Limit", String(limit));
  res.setHeader("RateLimit-Remaining", String(result.remaining));
  res.setHeader("RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
  if (!result.allowed) {
    res.status(429).json({ ok: false, error: "Too many requests. Try again later." });
    return false;
  }
  return true;
}

router.get("/config", (_req, res) => {
  ok(res, {
    cloudAuthConfigured: getAppConfig().supabaseConfigured,
    googleOAuthEnabled:
      getAppConfig().supabaseConfigured && process.env.SUPABASE_GOOGLE_OAUTH_ENABLED === "true",
  });
});

router.get("/session", handler(async (req, res) => {
  const auth = await resolveAuthContext(req, res);
  ensureCsrfCookie(req, res);
  const profile = await ensurePersonalProfile(auth);
  ok(res, sessionPayload(auth, profile.onboardingCompletedAt));
}));

router.post("/signup", handler(async (req, res) => {
  const input = signupSchema.parse(req.body);
  if (!enforceRateLimit(req, res, "signup", input.email, 8)) return;
  requireCloudAuth();
  const redirectTo = `${appBaseUrl()}/auth/callback`;
  const result = await getSupabasePublicClient().auth.signUp({
    email: input.email,
    password: input.password,
    options: { emailRedirectTo: redirectTo, data: { display_name: input.displayName } },
  });
  if (result.error) {
    ok(res, { verificationRequired: true, message: verificationMessage }, 202);
    return;
  }
  if (result.data.user) {
    await ensurePersonalProfile({
      mode: "supabase",
      userId: result.data.user.id,
      email: input.email,
      displayName: input.displayName,
      platformRole: "user",
    }, input.displayName);
  }
  if (result.data.session) setSessionCookies(res, result.data.session);
  ok(res, { verificationRequired: !result.data.session, message: verificationMessage }, 201);
}));

router.post("/login", handler(async (req, res) => {
  const input = loginSchema.parse(req.body);
  if (!enforceRateLimit(req, res, "login", input.email, 10)) return;
  requireCloudAuth();
  const result = await getSupabasePublicClient().auth.signInWithPassword(input);
  if (result.error || !result.data.session || !result.data.user?.email) {
    res.status(401).json({ ok: false, error: "Invalid email or password." });
    return;
  }
  setSessionCookies(res, result.data.session);
  const auth: AuthContext = {
    mode: "supabase",
    userId: result.data.user.id,
    email: result.data.user.email.toLowerCase(),
    displayName: String(result.data.user.user_metadata?.display_name ?? result.data.user.email),
    platformRole: "user",
  };
  const profile = await ensurePersonalProfile(auth);
  ok(res, sessionPayload(auth, profile.onboardingCompletedAt));
}));

router.post("/exchange", handler(async (req, res) => {
  const input = z.object({ accessToken: z.string().min(20), refreshToken: z.string().min(20) }).parse(req.body);
  if (!enforceRateLimit(req, res, "exchange", undefined, 20)) return;
  requireCloudAuth();
  const client = getSupabasePublicClient();
  const result = await client.auth.setSession({ access_token: input.accessToken, refresh_token: input.refreshToken });
  if (result.error || !result.data.session || !result.data.user?.email) {
    res.status(401).json({ ok: false, error: "The authentication link is invalid or expired." });
    return;
  }
  setSessionCookies(res, result.data.session);
  const auth: AuthContext = {
    mode: "supabase",
    userId: result.data.user.id,
    email: result.data.user.email.toLowerCase(),
    displayName: String(result.data.user.user_metadata?.display_name ?? result.data.user.email),
    platformRole: "user",
  };
  const profile = await ensurePersonalProfile(auth);
  ok(res, sessionPayload(auth, profile.onboardingCompletedAt));
}));

router.post("/refresh", handler(async (req, res) => {
  if (!enforceRateLimit(req, res, "refresh", undefined, 60)) return;
  requireCloudAuth();
  const refreshToken = typeof req.cookies?.[REFRESH_COOKIE] === "string" ? req.cookies[REFRESH_COOKIE] : "";
  if (!refreshToken) {
    res.status(401).json({ ok: false, error: "Session expired. Please sign in again." });
    return;
  }
  const result = await getSupabasePublicClient().auth.refreshSession({ refresh_token: refreshToken });
  if (result.error || !result.data.session) {
    clearSessionCookies(res);
    res.status(401).json({ ok: false, error: "Session expired. Please sign in again." });
    return;
  }
  setSessionCookies(res, result.data.session);
  ok(res, { refreshed: true });
}));

router.post("/forgot-password", handler(async (req, res) => {
  const email = emailSchema.parse(req.body?.email);
  if (!enforceRateLimit(req, res, "forgot", email, 5)) return;
  requireCloudAuth();
  await getSupabasePublicClient().auth.resetPasswordForEmail(email, { redirectTo: `${appBaseUrl()}/reset-password` });
  ok(res, { message: resetMessage });
}));

router.post("/reset-password", requireCsrf, handler(async (req, res) => {
  const password = passwordSchema.parse(req.body?.password);
  const auth = await resolveAuthContext(req, res);
  if (auth.mode !== "supabase") throw new Error("Password reset is only available with Supabase Auth.");
  const accessToken = typeof req.cookies?.[ACCESS_COOKIE] === "string" ? req.cookies[ACCESS_COOKIE] : "";
  const refreshToken = typeof req.cookies?.[REFRESH_COOKIE] === "string" ? req.cookies[REFRESH_COOKIE] : "";
  const client = getSupabasePublicClient();
  const session = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (session.error) throw new Error("The password reset session is invalid or expired.");
  const result = await client.auth.updateUser({ password });
  if (result.error) throw new Error("Unable to reset the password.");
  ok(res, { passwordUpdated: true });
}));

router.get("/oauth/google", handler(async (_req, res) => {
  requireCloudAuth();
  if (process.env.SUPABASE_GOOGLE_OAUTH_ENABLED !== "true") {
    res.status(404).json({ ok: false, error: "Google sign-in is not enabled." });
    return;
  }
  const result = await getSupabasePublicClient().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${appBaseUrl()}/auth/callback`, skipBrowserRedirect: true },
  });
  if (result.error || !result.data.url) throw new Error("Unable to start Google sign-in.");
  ok(res, { url: result.data.url });
}));

router.post("/logout", requireCsrf, handler(async (req, res) => {
  if (getAppConfig().supabaseConfigured) {
    const accessToken = typeof req.cookies?.[ACCESS_COOKIE] === "string" ? req.cookies[ACCESS_COOKIE] : "";
    const refreshToken = typeof req.cookies?.[REFRESH_COOKIE] === "string" ? req.cookies[REFRESH_COOKIE] : "";
    if (accessToken && refreshToken) {
      const client = getSupabasePublicClient();
      const session = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (!session.error) await client.auth.signOut({ scope: "local" });
    }
  }
  clearSessionCookies(res);
  res.status(204).send();
}));

router.get("/profile", handler(async (req, res) => {
  const auth = await resolveAuthContext(req, res);
  ensureCsrfCookie(req, res);
  ok(res, await ensurePersonalProfile(auth));
}));

router.put("/profile", requireCsrf, handler(async (req, res) => {
  const auth = await resolveAuthContext(req, res);
  ok(res, await updatePersonalProfile(auth, req.body ?? {}));
}));

router.put("/onboarding", requireCsrf, handler(async (req, res) => {
  const auth = await resolveAuthContext(req, res);
  ok(res, await updatePersonalProfile(auth, { ...(req.body ?? {}), completeOnboarding: true }));
}));

router.post("/account-deletion", requireCsrf, handler(async (req, res) => {
  const auth = await resolveAuthContext(req, res);
  if (!enforceRateLimit(req, res, "account-deletion", auth.userId, 3)) return;
  ok(res, await requestAccountDeletion(auth, req.body?.reason), 202);
}));

router.get("/data-export", handler(async (req, res) => {
  const auth = await resolveAuthContext(req, res);
  if (!enforceRateLimit(req, res, "data-export", auth.userId, 3)) return;
  const data = await exportPersonalData(auth);
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Content-Disposition", `attachment; filename="play-pack-pilot-data-${new Date().toISOString().slice(0, 10)}.json"`);
  res.type("application/json").send(JSON.stringify(data, null, 2));
}));

function sessionPayload(auth: AuthContext, onboardingCompletedAt: string | null) {
  return {
    user: {
      id: auth.userId,
      email: auth.email,
      displayName: auth.displayName,
      platformRole: auth.platformRole,
    },
    mode: auth.mode,
    onboardingCompleted: Boolean(onboardingCompletedAt),
    googleOAuthEnabled: process.env.SUPABASE_GOOGLE_OAUTH_ENABLED === "true",
  };
}

function requireCloudAuth() {
  if (!getAppConfig().supabaseConfigured) throw new AuthenticationUnavailableError();
}

function appBaseUrl() {
  return (process.env.APP_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
}

const verificationMessage = "If the address can be registered, a verification email will arrive shortly.";
const resetMessage = "If an account exists for that address, a password reset email will arrive shortly.";

export default router;
