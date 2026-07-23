import type { PlanKey } from "@/lib/billing";
import type { CustomScanPolicy, PlanPolicyMap } from "./types";

export function customScanPolicies():PlanPolicyMap{return{
  free_flight:{enabled:false,maxProfiles:0,monthlyRuns:0,minimumCadenceMinutes:43200},
  co_pilot:{enabled:false,maxProfiles:0,monthlyRuns:0,minimumCadenceMinutes:43200},
  ace_pilot:{enabled:true,maxProfiles:bounded("CUSTOM_SCAN_ACE_MAX_PROFILES",5,1,25),monthlyRuns:bounded("CUSTOM_SCAN_ACE_MONTHLY_RUNS",25,1,500),minimumCadenceMinutes:bounded("CUSTOM_SCAN_ACE_MIN_CADENCE_MINUTES",1440,60,43200)},
  squadron:{enabled:true,maxProfiles:bounded("CUSTOM_SCAN_SQUADRON_MAX_PROFILES",20,1,50),monthlyRuns:bounded("CUSTOM_SCAN_SQUADRON_MONTHLY_RUNS",100,1,1000),minimumCadenceMinutes:bounded("CUSTOM_SCAN_SQUADRON_MIN_CADENCE_MINUTES",360,60,43200)}
};}
export function customScanPolicy(planKey:PlanKey):CustomScanPolicy{return customScanPolicies()[planKey];}
function bounded(name:string,fallback:number,min:number,max:number){const parsed=Number(process.env[name]);return Number.isInteger(parsed)&&parsed>=min&&parsed<=max?parsed:fallback;}
