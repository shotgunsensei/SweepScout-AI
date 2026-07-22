import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import { getAppConfig } from "@/lib/env";

export const ACCESS_COOKIE = "ppp_access";
export const REFRESH_COOKIE = "ppp_refresh";
export const CSRF_COOKIE = "ppp_csrf";

export type PlatformRole = "user" | "admin" | "owner";

export type AuthContext = {
  mode: "local" | "supabase";
  userId: string;
  email: string;
  displayName: string;
  platformRole: PlatformRole;
};

export class AuthenticationError extends Error {
  constructor(message = "Authentication required.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthenticationUnavailableError extends Error {
  constructor(message = "Authentication is not configured for this deployment.") {
    super(message);
    this.name = "AuthenticationUnavailableError";
  }
}

type AuthenticatedRequest = Request & { auth?: AuthContext };

let serviceClient: SupabaseClient | null = null;

export function getSupabasePublicClient() {
  requireSupabaseConfiguration();
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function getSupabaseServiceClient() {
  requireSupabaseConfiguration();
  serviceClient ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return serviceClient;
}

export function localAuthContext(): AuthContext {
  const ownerEnabled = process.env.PLAYPACKPILOT_LOCAL_ADMIN === "true";
  return {
    mode: "local",
    userId: "00000000-0000-4000-8000-000000000001",
    email: (process.env.PLATFORM_OWNER_EMAIL ?? "local@playpackpilot.test").trim().toLowerCase(),
    displayName: ownerEnabled ? "Local owner" : "Local pilot",
    platformRole: ownerEnabled ? "owner" : "user",
  };
}

export async function resolveAuthContext(req: Request, res?: Response): Promise<AuthContext> {
  const config = getAppConfig();
  if (!config.supabaseConfigured) {
    if (process.env.NODE_ENV === "production") throw new AuthenticationUnavailableError();
    return localAuthContext();
  }

  const bearer = bearerToken(req);
  const cookieToken = typeof req.cookies?.[ACCESS_COOKIE] === "string" ? req.cookies[ACCESS_COOKIE] : null;
  const accessToken = bearer ?? cookieToken;
  let user: User | null = null;

  if (accessToken) {
    const result = await getSupabasePublicClient().auth.getUser(accessToken);
    user = result.error ? null : result.data.user;
  }

  if (!user && !bearer && typeof req.cookies?.[REFRESH_COOKIE] === "string") {
    const refreshed = await getSupabasePublicClient().auth.refreshSession({
      refresh_token: req.cookies[REFRESH_COOKIE],
    });
    if (!refreshed.error && refreshed.data.session) {
      user = refreshed.data.user;
      if (res) setSessionCookies(res, refreshed.data.session);
    }
  }

  if (!user?.email) throw new AuthenticationError();
  const profile = await loadProfileAccess(user.id);
  if (profile.account_disabled_at) throw new AuthenticationError("This account is disabled.");

  return {
    mode: "supabase",
    userId: user.id,
    email: user.email.toLowerCase(),
    displayName: profile.display_name || user.user_metadata?.display_name || user.email,
    platformRole: normalizeRole(profile.platform_role),
  };
}

export async function authenticateRequest(req: Request, res: Response, next: NextFunction) {
  if (req.path === "/billing/webhook") return next();
  try {
    const auth = await resolveAuthContext(req, res);
    (req as AuthenticatedRequest).auth = auth;
    ensureCsrfCookie(req, res);
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRequestAuth(req: Request) {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) throw new AuthenticationError();
  return auth;
}

export function requireCsrf(req: Request, _res: Response, next: NextFunction) {
  if (req.path === "/billing/webhook" || ["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (bearerToken(req)) return next();

  const cookie = typeof req.cookies?.[CSRF_COOKIE] === "string" ? req.cookies[CSRF_COOKIE] : "";
  const header = typeof req.headers["x-csrf-token"] === "string" ? req.headers["x-csrf-token"] : "";
  if (!safeEqual(cookie, header)) return next(new AuthenticationError("Invalid CSRF token."));
  next();
}

export function setSessionCookies(res: Response, session: Session) {
  const secure = process.env.NODE_ENV === "production";
  res.cookie(ACCESS_COOKIE, session.access_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/api",
    maxAge: Math.max(60, session.expires_in ?? 3600) * 1000,
  });
  res.cookie(REFRESH_COOKIE, session.refresh_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  const csrf = randomBytes(32).toString("base64url");
  res.cookie(CSRF_COOKIE, csrf, {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookies(res: Response) {
  const secure = process.env.NODE_ENV === "production";
  const shared = { secure, sameSite: "lax" as const };
  res.clearCookie(ACCESS_COOKIE, { ...shared, path: "/api" });
  res.clearCookie(REFRESH_COOKIE, { ...shared, path: "/api/auth" });
  res.clearCookie(CSRF_COOKIE, { ...shared, path: "/" });
}

export function ensureCsrfCookie(req: Request, res: Response) {
  if (typeof req.cookies?.[CSRF_COOKIE] === "string" && req.cookies[CSRF_COOKIE].length >= 32) return;
  const secure = process.env.NODE_ENV === "production";
  res.cookie(CSRF_COOKIE, randomBytes(32).toString("base64url"), {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function authRateLimitKey(req: Request, scope: string, identity?: string) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const normalized = (identity ?? "").trim().toLowerCase();
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  return `${scope}:${ip}:${digest}`;
}

function bearerToken(req: Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function requireSupabaseConfiguration() {
  if (!getAppConfig().supabaseConfigured) throw new AuthenticationUnavailableError();
}

async function loadProfileAccess(userId: string) {
  const result = await getSupabaseServiceClient()
    .from("profiles")
    .select("display_name, platform_role, account_disabled_at")
    .eq("id", userId)
    .maybeSingle();
  if (result.error) throw new AuthenticationError("Unable to load account access.");
  return result.data ?? { display_name: "", platform_role: "user", account_disabled_at: null };
}

function normalizeRole(value: unknown): PlatformRole {
  return value === "owner" || value === "admin" ? value : "user";
}

function safeEqual(left: string, right: string) {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
