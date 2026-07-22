import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Redirect, useLocation } from "wouter";
import { apiGet, apiSend, ApiError } from "@/lib/api";

export type AuthSession = {
  user: {
    id: string;
    email: string;
    displayName: string;
    platformRole: "user" | "admin" | "owner";
  };
  mode: "local" | "supabase";
  onboardingCompleted: boolean;
  googleOAuthEnabled: boolean;
};

type AuthState = {
  session: AuthSession | null;
  loading: boolean;
  unavailable: boolean;
  refresh: () => Promise<AuthSession | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await apiGet<AuthSession>("/auth/session");
      setSession(next);
      setUnavailable(false);
      return next;
    } catch (error) {
      setSession(null);
      setUnavailable(error instanceof ApiError && error.status === 503);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await apiSend<void>("/auth/logout", "POST");
    setSession(null);
  }, []);

  useEffect(() => {
    void refresh();
    const expired = () => setSession(null);
    window.addEventListener("play-pack-pilot-session-expired", expired);
    return () => window.removeEventListener("play-pack-pilot-session-expired", expired);
  }, [refresh]);

  const value = useMemo(() => ({ session, loading, unavailable, refresh, logout }), [session, loading, unavailable, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, unavailable } = useAuth();
  const [location] = useLocation();
  if (loading) return <AuthLoading />;
  if (unavailable) return <AuthUnavailable />;
  if (!session) return <Redirect to={`/login?next=${encodeURIComponent(safeDestination(location))}`} />;
  if (!session.onboardingCompleted && location !== "/onboarding") return <Redirect to="/onboarding" />;
  return <>{children}</>;
}

function AuthLoading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6 text-foreground">
      <div className="text-center">
        <img src="/brand/play-pack-pilot-logo-original.png" alt="Play Pack Pilot" className="mx-auto h-24 w-40 object-contain" />
        <p className="mt-4 text-sm text-muted">Checking flight credentials…</p>
      </div>
    </div>
  );
}

function AuthUnavailable() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6 text-foreground">
      <div className="max-w-lg rounded-xl border border-danger/30 bg-panel p-7 text-center shadow-[var(--shadow-soft)]">
        <p className="font-display text-xl font-bold">Authentication is not configured</p>
        <p className="mt-3 text-sm leading-6 text-muted">This production deployment is locked until Supabase Auth and PostgreSQL credentials are configured.</p>
      </div>
    </div>
  );
}

export function safeDestination(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/dashboard";
  return value;
}
