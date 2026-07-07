import type { PrizeCategory } from "@/lib/types";

export const PRIZE_CATEGORIES: PrizeCategory[] = [
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
];

const CATEGORY_LABELS: Record<PrizeCategory, string> = {
  cash: "Cash",
  vehicle: "Vehicle",
  electronics: "Electronics",
  travel: "Travel",
  "home goods": "Home goods",
  "gift card": "Gift card",
  tools: "Tools",
  gaming: "Gaming",
  "food/restaurant": "Food/restaurant",
  "local business": "Local business",
  "high-risk/unclear": "High-risk/unclear",
};

export function categoryLabel(category: string) {
  return CATEGORY_LABELS[category as PrizeCategory] ?? category;
}

export function categoryTone(category: string): "default" | "ok" | "warn" | "danger" {
  if (category === "high-risk/unclear") return "warn";
  if (category === "cash" || category === "gift card") return "ok";
  return "default";
}
