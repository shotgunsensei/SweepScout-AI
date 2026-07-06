import { runDiscoveryJob } from "../src/lib/services/discovery";
import { getStore } from "../src/lib/storage/store";

const store = await getStore();
const requestedJobId = process.argv[2];
const job = requestedJobId
  ? await store.getDiscoveryJob(requestedJobId)
  : (await store.listDiscoveryJobs()).find((candidate) => candidate.status === "queued");

if (!job) {
  console.log("No matching discovery job found.");
  process.exit(0);
}

const result = await runDiscoveryJob(job.id);
console.log(`Discovery job ${result.job.id} completed with ${result.sweepstakes.length} candidates.`);
