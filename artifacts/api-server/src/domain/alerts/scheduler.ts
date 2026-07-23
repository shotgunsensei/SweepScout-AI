import { getAppConfig } from "@/lib/env";
import { logger } from "../../lib/logger";
import { processPhase9Cycle } from "./service";
let timer:NodeJS.Timeout|null=null;
export function startAlertsScheduler(){if(timer||process.env.PLAYPACKPILOT_ALERTS_ENABLED!=="true"||!getAppConfig().supabaseConfigured)return;const run=async()=>{try{const result=await processPhase9Cycle();logger.info({generated:result.generated,scans:result.scans.length,digests:result.digests.length},"Phase 9 monitoring cycle completed");}catch(error){logger.error({err:error},"Phase 9 monitoring cycle failed");}};void run();timer=setInterval(()=>void run(),boundedInterval());timer.unref();}
function boundedInterval(){const parsed=Number(process.env.PLAYPACKPILOT_ALERTS_INTERVAL_SECONDS);return(Number.isInteger(parsed)&&parsed>=60&&parsed<=3600?parsed:300)*1000;}
