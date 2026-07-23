import type { PlanKey } from "@/lib/billing";

export type NotificationType = "high_match"|"ending_soon"|"entry_due"|"rules_changed"|"deadline_changed"|"opportunity_canceled"|"source_confidence_reduced"|"custom_scan_completed"|"credits_low"|"payment_failed";
export type DigestKind = "daily"|"weekly"|"ending_soon"|"high_value"|"recommendations"|"entry_reminders";
export type CustomScanFilters = { keywords?:string;sponsor?:string;prizeType?:string;minimumValue?:number;country?:string;region?:string;deadlineBefore?:string;category?:string;maximumEffort?:number };
export type CustomScanner = { id:string;user_id:string;name:string;filters:CustomScanFilters;source_ids:string[];cadence_minutes:number;enabled:boolean;next_run_at:string;last_run_at:string|null;created_at:string;updated_at:string };
export type CustomScanPolicy = { enabled:boolean;maxProfiles:number;monthlyRuns:number;minimumCadenceMinutes:number };
export type NotificationPreferences = { inAppEnabled:boolean;emailEnabled:boolean;dailyDigestEnabled:boolean;weeklyDigestEnabled:boolean;endingSoonEnabled:boolean;highValueEnabled:boolean;recommendationsEnabled:boolean;entryRemindersEnabled:boolean;emailUnsubscribedAt:string|null };
export type EmailMessage = { to:string;subject:string;text:string;html:string;headers?:Record<string,string> };
export type EmailProvider = { name:string;send(message:EmailMessage):Promise<{messageId:string}> };
export type PlanPolicyMap = Record<PlanKey,CustomScanPolicy>;
