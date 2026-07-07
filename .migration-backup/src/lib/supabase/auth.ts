import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getAppConfig } from "@/lib/env";

export async function createSupabaseAuthClient() {
  const config = getAppConfig();
  if (!config.supabaseConfigured) {
    return null;
  }

  const cookieStore = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot set cookies; Route Handlers and Server Actions can.
        }
      },
    },
  });
}
