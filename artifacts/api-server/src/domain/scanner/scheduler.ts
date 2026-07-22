import { getAppConfig } from "@/lib/env";
import { logger } from "../../lib/logger";
import { SourceScanner } from "@/lib/scanner/pipeline";
import { SupabaseScannerRepository } from "@/lib/scanner/repository";

let timer: NodeJS.Timeout | null = null;

export function startSourceScannerScheduler() {
  if (timer || process.env.PLAYPACKPILOT_SCANNER_ENABLED !== "true" || !getAppConfig().supabaseConfigured) return;
  const scanner = new SourceScanner(new SupabaseScannerRepository());
  const run = async () => {
    try {
      const results = await scanner.runDueSources();
      if (results.length) logger.info({ results }, "approved source scan cycle completed");
    } catch (error) {
      logger.error({ err: error }, "approved source scan cycle failed");
    }
  };
  void run();
  timer = setInterval(() => void run(), 60_000);
  timer.unref();
}
