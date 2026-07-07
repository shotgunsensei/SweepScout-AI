import app from "./app";
import { logger } from "./lib/logger";
import { startInboxMonitoring } from "@/lib/services/inbox-monitor";
import { startRulesChangeMonitoring } from "@/lib/services/rules-change-monitor";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startInboxMonitoring().catch((err) => {
    logger.warn({ err }, "Inbox monitoring did not start");
  });
  startRulesChangeMonitoring().catch((err) => {
    logger.warn({ err }, "Rules-change monitoring did not start");
  });
});
