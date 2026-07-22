export type PlanKey = "free_flight" | "co_pilot" | "ace_pilot" | "squadron";
export type BillingInterval = "month" | "year";
export type CreditOperation = "basic_eligibility" | "personalized_fit" | "rules_summary" | "entry_checklist" | "deep_legitimacy" | "official_rules_extraction" | "promotion_deep_analysis" | "personalized_report" | "custom_scan" | "large_source_scan";
export type CatalogPlan = { key: PlanKey; name: string; monthlyPriceCents: number; annualPriceCents: number | null; monthlyCredits: number; description: string; features: Record<string, number | boolean>; prices: Record<BillingInterval, string | null> };
export type SubscriptionRecord = { userId: string; providerSubscriptionId: string | null; providerPriceId: string | null; planKey: PlanKey; status: string; currentPeriodStart: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; trialEnd: string | null; createdAt: string; updatedAt: string };
export type StripeEvent = { id: string; type: string; data: { object: Record<string, unknown> } };
