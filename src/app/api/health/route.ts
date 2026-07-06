import { getAppConfig } from "@/lib/env";
import { jsonOk } from "@/lib/http";
import { getStore } from "@/lib/storage/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const config = getAppConfig();
  const store = await getStore();
  return jsonOk({
    app: "SweepScout AI",
    mode: store.mode,
    openaiConfigured: config.openaiConfigured,
    supabaseConfigured: config.supabaseConfigured,
    browserHeadless: config.browserHeadless,
    warnings: config.warnings,
  });
}
