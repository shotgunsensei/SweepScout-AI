import type { PrizeCategory, RiskFlag, RulesExtractionData } from "@/lib/types";

export const PRIZE_CATEGORIES = [
  "cash",
  "vehicle",
  "electronics",
  "travel",
  "home goods",
  "gift card",
  "tools",
  "gaming",
  "food/restaurant",
  "local business",
  "high-risk/unclear",
] as const satisfies readonly PrizeCategory[];

export const DEFAULT_CATEGORY_PREFERENCES: PrizeCategory[] = [
  "cash",
  "gift card",
  "electronics",
  "travel",
  "home goods",
  "tools",
  "gaming",
  "vehicle",
  "food/restaurant",
  "local business",
];

type ClassificationInput = {
  title?: string | null;
  sponsor?: string | null;
  url?: string | null;
  text?: string | null;
  rulesText?: string | null;
  prizeSummary?: string | null;
  eligibilitySummary?: string | null;
  extractedRules?: RulesExtractionData | null;
  riskFlags?: RiskFlag[];
  scamScore?: number | null;
  prizeRetailValue?: number | null;
  purchaseRequired?: boolean;
  noPurchaseMethodFound?: boolean;
};

const CATEGORY_ALIASES: Record<string, PrizeCategory> = {
  auto: "vehicle",
  automotive: "vehicle",
  car: "vehicle",
  cars: "vehicle",
  truck: "vehicle",
  trucks: "vehicle",
  vehicle: "vehicle",
  vehicles: "vehicle",
  electronics: "electronics",
  electronic: "electronics",
  tech: "electronics",
  technology: "electronics",
  travel: "travel",
  vacation: "travel",
  trip: "travel",
  home: "home goods",
  "home goods": "home goods",
  housewares: "home goods",
  appliance: "home goods",
  appliances: "home goods",
  furniture: "home goods",
  cash: "cash",
  money: "cash",
  "cash prize": "cash",
  "gift card": "gift card",
  "gift cards": "gift card",
  giftcard: "gift card",
  voucher: "gift card",
  vouchers: "gift card",
  tools: "tools",
  tool: "tools",
  hardware: "tools",
  gaming: "gaming",
  game: "gaming",
  games: "gaming",
  restaurant: "food/restaurant",
  restaurants: "food/restaurant",
  food: "food/restaurant",
  dining: "food/restaurant",
  grocery: "food/restaurant",
  groceries: "food/restaurant",
  "food restaurant": "food/restaurant",
  "food/restaurant": "food/restaurant",
  local: "local business",
  "local business": "local business",
  regional: "local business",
  "high risk": "high-risk/unclear",
  highrisk: "high-risk/unclear",
  unclear: "high-risk/unclear",
  unknown: "high-risk/unclear",
  unclassified: "high-risk/unclear",
  "high risk unclear": "high-risk/unclear",
  "high risk/unclear": "high-risk/unclear",
  "high-risk unclear": "high-risk/unclear",
  "high-risk/unclear": "high-risk/unclear",
};

const CATEGORY_PATTERNS: Array<{ category: Exclude<PrizeCategory, "high-risk/unclear">; weight: number; patterns: RegExp[] }> = [
  {
    category: "gift card",
    weight: 7,
    patterns: [
      /\bgift\s*cards?\b/i,
      /\bvisa\s+(?:prepaid\s+)?cards?\b/i,
      /\bmastercard\s+(?:prepaid\s+)?cards?\b/i,
      /\bamazon\s+(?:egift\s+)?cards?\b/i,
      /\bvouchers?\b/i,
      /\bstore\s+credit\b/i,
    ],
  },
  {
    category: "cash",
    weight: 4,
    patterns: [
      /\$\s?\d[\d,.]*/i,
      /\bcash\b/i,
      /\bcheck\b/i,
      /\bmoney\b/i,
      /\bgrand\s+prize\s+of\s+\$?\d/i,
    ],
  },
  {
    category: "vehicle",
    weight: 8,
    patterns: [
      /\b(cars?|trucks?|suvs?|vehicles?|automotive|motorcycles?|atvs?|rv|rvs)\b/i,
      /\bdealership\b/i,
      /\btest\s+drive\b/i,
      /\bnew\s+(?:car|truck|suv)\b/i,
    ],
  },
  {
    category: "electronics",
    weight: 6,
    patterns: [
      /\b(electronics?|phones?|iphones?|androids?|laptops?|tablets?|tvs?|televisions?|cameras?|headphones?|earbuds?|smartwatch|smartwatches)\b/i,
      /\bmacbook\b/i,
      /\bipad\b/i,
      /\bcomputer\b/i,
    ],
  },
  {
    category: "travel",
    weight: 6,
    patterns: [
      /\b(travel|trips?|vacations?|getaways?|flights?|airfare|hotels?|resorts?|cruises?|lodging|weekend\s+stay)\b/i,
      /\ball[- ]inclusive\b/i,
    ],
  },
  {
    category: "home goods",
    weight: 5,
    patterns: [
      /\b(home\s+goods?|housewares?|kitchen|appliances?|furniture|mattress|mattresses|decor|grill|patio|smart\s+home)\b/i,
      /\bhome\s+(?:upgrade|makeover|bundle)\b/i,
    ],
  },
  {
    category: "tools",
    weight: 6,
    patterns: [
      /\b(tools?|tool\s+set|power\s+tools?|drills?|saws?|wrenches?|hardware|workshop|toolbox|tool\s+box)\b/i,
      /\bdewalt\b/i,
      /\bmilwaukee\b/i,
      /\bmakita\b/i,
    ],
  },
  {
    category: "gaming",
    weight: 6,
    patterns: [
      /\b(gaming|game\s+console|console|xbox|playstation|ps5|nintendo|switch|steam\s+deck|gaming\s+pc|video\s+games?)\b/i,
      /\besports?\b/i,
    ],
  },
  {
    category: "food/restaurant",
    weight: 5,
    patterns: [
      /\b(food|restaurant|dining|dinner|lunch|breakfast|pizza|coffee|meal|grocery|groceries|snacks?|beverages?)\b/i,
      /\bchef\b/i,
      /\bcatering\b/i,
    ],
  },
  {
    category: "local business",
    weight: 3,
    patterns: [
      /\b(local|regional|nearby|metro|county|city|town|community|chamber\s+of\s+commerce|county\s+fair|radio\s+station|sports\s+team|dealership|store\s+promotion)\b/i,
      /\b(residents?\s+of|open\s+to\s+(?:[a-z\s]+)\s+residents?)\b/i,
    ],
  },
];

const HIGH_RISK_CODES = new Set([
  "bank-info",
  "ssn-before-winning",
  "payment-requested",
  "purchase-required",
  "hidden-rules",
  "missing-rules",
  "no-purchase-method",
  "domain-mismatch",
  "impossible-prize",
  "gambling-lottery",
]);

export function normalizePrizeCategory(value: string | null | undefined): PrizeCategory {
  const normalized = normalizeCategoryToken(value);
  if (!normalized) return "high-risk/unclear";
  return CATEGORY_ALIASES[normalized] ?? "high-risk/unclear";
}

export function normalizeCategoryPreferences(values: readonly string[] | null | undefined): PrizeCategory[] {
  const source = values?.length ? values : DEFAULT_CATEGORY_PREFERENCES;
  const normalized = source.map(normalizePrizeCategory);
  const ordered = uniqueCategories(normalized);
  return ordered.length ? ordered : DEFAULT_CATEGORY_PREFERENCES;
}

export function categoryPriority(category: string | null | undefined, preferences: readonly string[] | null | undefined) {
  const normalizedCategory = normalizePrizeCategory(category);
  const normalizedPreferences = normalizeCategoryPreferences(preferences);
  const preferredIndex = normalizedPreferences.indexOf(normalizedCategory);
  if (preferredIndex !== -1) return preferredIndex + 1;
  if (normalizedCategory === "high-risk/unclear") return normalizedPreferences.length + PRIZE_CATEGORIES.length + 1;
  const categoryIndex = PRIZE_CATEGORIES.indexOf(normalizedCategory);
  return normalizedPreferences.length + (categoryIndex === -1 ? PRIZE_CATEGORIES.length : categoryIndex) + 1;
}

export function classifySweepstakeCategory(input: ClassificationInput): PrizeCategory {
  const haystack = [
    input.title,
    input.sponsor,
    input.url,
    input.prizeSummary,
    input.eligibilitySummary,
    input.text,
    input.rulesText,
    input.extractedRules?.title,
    input.extractedRules?.sponsor,
    input.extractedRules?.prizeSummary,
    input.extractedRules?.eligibility,
    input.extractedRules?.redFlags.join(" "),
  ]
    .filter(Boolean)
    .join("\n");

  const scored = CATEGORY_PATTERNS.map((definition) => ({
    category: definition.category,
    score: definition.patterns.reduce((score, pattern) => score + (pattern.test(haystack) ? definition.weight : 0), 0),
  }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score);

  const highRisk = hasHighRiskSignals(input);
  const best = scored[0];
  if (!best) return "high-risk/unclear";
  if (highRisk && best.score < 10) return "high-risk/unclear";
  return best.category;
}

function hasHighRiskSignals(input: ClassificationInput) {
  const highRiskFlag = (input.riskFlags ?? []).some((flag) => flag.severity === "high" || HIGH_RISK_CODES.has(flag.code));
  return (
    highRiskFlag ||
    Boolean(input.purchaseRequired) ||
    Boolean(input.noPurchaseMethodFound) ||
    Boolean(input.extractedRules?.purchaseOrPaymentRequested) ||
    Boolean(input.extractedRules?.ssnRequested) ||
    Boolean(input.extractedRules?.bankingInfoRequested) ||
    (input.scamScore ?? 0) >= 70
  );
}

function uniqueCategories(values: PrizeCategory[]) {
  const seen = new Set<PrizeCategory>();
  const result: PrizeCategory[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function normalizeCategoryToken(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[_-]+/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}
