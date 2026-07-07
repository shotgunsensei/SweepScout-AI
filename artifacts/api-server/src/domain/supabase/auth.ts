import { createServerClient } from "@supabase/ssr";
import { getAppConfig } from "@/lib/env";

// In the Replit port this app runs in SQLite mode by default, so Supabase auth
// is only reachable when all Supabase env vars are set. We drop the Next.js
// cookie integration (next/headers) and use a no-op cookie store; cookie-based
// session refresh is not used by the Express server.
export async function createSupabaseAuthClient() {
  const config = getAppConfig();
  if (!config.supabaseConfigured) {
    return null;
  }

  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // no-op: Express server does not persist Supabase auth cookies.
      },
    },
  });
}
