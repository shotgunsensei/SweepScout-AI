export type UserSweepstakesStatus = "interested" | "saved" | "entered" | "enter_again" | "skipped" | "hidden" | "won" | "expired";
export type SavedPriority = "low" | "normal" | "high";
export type MatchFactor = { key: string; label: string; impact: "positive" | "negative" | "neutral"; points: number; explanation: string };
export type MatchInput = {
  legitimacyScore: number; sourceConfidenceScore: number; entryEffortScore: number; maximumEffort: number; eligibilityStatus: "eligible" | "ineligible" | "review";
  categories: string[]; preferredCategories: string[]; prizeValue: number; minimumPrize: number; entryFrequency: string; preferredFrequencies: string[];
  hasSocialRequirement: boolean; allowSocial: boolean; hasPurchaseRequirement: boolean; allowPurchase: boolean; userStatus: string | null;
};
export type CalendarEvent = { uid: string; title: string; description: string; startsAt: string; endsAt?: string | null; url?: string | null; recurrence?: "daily" | "weekly" | "monthly" | null; recurrenceUntil?: string | null; timezone: string };
export type HangarQuery = { q: string | null; priority: SavedPriority | null; status: UserSweepstakesStatus | null; frequency: string | null; sort: "saved_newest" | "deadline" | "priority" | "next_entry" | "prize" };
