import { connectorsConfigured } from "@/lib/discovery/connector-providers";
import { createAndRunDiscovery } from "@/lib/services/discovery";
import { getStore } from "@/lib/storage/store";
import { logger } from "../../lib/logger";

let timer: NodeJS.Timeout | null = null;

/**
 * Recurring real-sweepstakes research: web (Brave) + YouTube creator giveaways.
 * Runs only when connectors are configured and the user has enabled automated
 * discovery in Settings. Interval is intentionally long — YouTube search quota
 * is ~100 calls/day and each run costs a few searches.
 */
export function startDiscoveryScheduler() {
  if (timer || !connectorsConfigured() || process.env.SWEEPSCOUT_AUTO_DISCOVERY === "false") return;

  const run = async () => {
    try {
      const store = await getStore();
      const settings = await store.getSettings();
      if (!settings.automatedDiscoveryEnabled) return;
      const web = await createAndRunDiscovery({ provider: "brave", maxResults: 15 });
      logger.info({ jobId: web.job.id, saved: web.sweepstakes.length }, "scheduled web discovery completed");
      const youtube = await createAndRunDiscovery({ provider: "youtube", maxResults: 10 });
      logger.info({ jobId: youtube.job.id, saved: youtube.sweepstakes.length }, "scheduled YouTube discovery completed");
    } catch (error) {
      logger.warn({ err: error }, "scheduled discovery run failed");
    }
  };

  timer = setInterval(() => void run(), boundedIntervalMs());
  timer.unref();
}

function boundedIntervalMs() {
  const parsed = Number(process.env.SWEEPSCOUT_AUTO_DISCOVERY_INTERVAL_MINUTES);
  const minutes = Number.isInteger(parsed) && parsed >= 60 && parsed <= 24 * 60 ? parsed : 12 * 60;
  return minutes * 60_000;
}
