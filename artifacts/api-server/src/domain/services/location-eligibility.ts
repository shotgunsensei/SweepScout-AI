import type { UserProfile } from "@/lib/types";

export type LocationEligibilityAssessment = {
  score: number;
  localRegion: string | null;
  requiresInPersonAppearance: boolean;
  notes: string[];
};

type AssessmentInput = {
  title: string;
  url?: string | null;
  query?: string | null;
  snippet?: string | null;
  text?: string | null;
  stateEligibility?: string[];
  localRegion?: string | null;
  requiresInPersonAppearance?: boolean;
};

const LOCAL_QUERY_TEMPLATES = [
  "{place} radio station contests no purchase necessary",
  "{place} local dealership giveaway official rules",
  "{place} grocery store sweepstakes official rules",
  "{place} chamber of commerce giveaway promotion",
  "{place} county fair giveaway official rules",
  "{place} local sports team promotion giveaway",
];

const LOCAL_KEYWORDS =
  /\b(radio station|dealership|dealer|grocery|supermarket|chamber of commerce|county fair|state fair|sports team|arena|local business|community|metro|regional)\b/i;

const IN_PERSON_APPEARANCE =
  /\b(in[-\s]?person|must be present|must attend|attendance required|on[-\s]?site|appear at|visit (?:our|the) (?:store|dealership|location)|local pickup|pickup only|claim at|winner must attend|present to win|must pick up)\b/i;

export function normalizeNearbyMetros(value: unknown): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const seen = new Set<string>();
  const metros: string[] = [];
  for (const item of source) {
    if (typeof item !== "string") continue;
    const metro = item.replace(/\s+/g, " ").trim();
    const key = metro.toLowerCase();
    if (!metro || seen.has(key)) continue;
    seen.add(key);
    metros.push(metro);
  }
  return metros.slice(0, 12);
}

export function buildLocalDiscoveryQueries(profile: UserProfile) {
  const state = profile.state.trim().toUpperCase();
  const city = profile.city.replace(/\s+/g, " ").trim();
  const metros = normalizeNearbyMetros(profile.preferences.nearbyMetros);
  const places = uniqueCompact([
    city && state ? `${city} ${state}` : city,
    ...metros.map((metro) => appendStateIfMissing(metro, state)),
    state,
  ]);

  const usablePlaces = places.length ? places : ["local"];
  return uniqueCompact(
    usablePlaces.flatMap((place) => LOCAL_QUERY_TEMPLATES.map((template) => template.replace("{place}", place))),
  );
}

export function assessLocationEligibility(input: AssessmentInput, profile: UserProfile): LocationEligibilityAssessment {
  const haystack = [input.title, input.url, input.query, input.snippet, input.text, input.localRegion]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
  const normalizedHaystack = normalizeForMatch(haystack);
  const state = profile.state.trim().toUpperCase();
  const city = profile.city.replace(/\s+/g, " ").trim();
  const metros = normalizeNearbyMetros(profile.preferences.nearbyMetros);
  const stateEligibility = input.stateEligibility ?? [];
  const requiresInPersonAppearance = Boolean(input.requiresInPersonAppearance) || IN_PERSON_APPEARANCE.test(haystack);
  const notes: string[] = [];
  let score = 45;

  const stateAllowed = isStateAllowed(state, stateEligibility);
  if (stateAllowed === true) {
    score += 20;
    notes.push(`Location match: ${state || "profile state"} is eligible.`);
  } else if (stateAllowed === false) {
    score -= 35;
    notes.push(`Location concern: ${state || "profile state"} is not listed as eligible.`);
  }

  const matchedMetro = metros.find((metro) => normalizedHaystack.includes(normalizeForMatch(metro)));
  const cityMatched = city ? normalizedHaystack.includes(normalizeForMatch(city)) : false;
  const stateMatched = state ? hasToken(normalizedHaystack, state.toLowerCase()) : false;
  const localRegion = input.localRegion ?? (cityMatched ? `${city}${state ? `, ${state}` : ""}` : matchedMetro ?? (stateMatched ? state : null));

  if (cityMatched || matchedMetro) {
    score += 25;
    notes.push(`Local fit: result matches ${cityMatched ? city : matchedMetro}.`);
  } else if (stateMatched) {
    score += 12;
    notes.push(`Regional fit: result references ${state}.`);
  }

  if (LOCAL_KEYWORDS.test(haystack)) {
    score += 10;
    notes.push("Local source signal detected.");
  }

  if (!city && !metros.length) {
    score -= 8;
    notes.push("Add city or nearby metros in the vault for sharper local scoring.");
  }

  if (requiresInPersonAppearance) {
    if (profile.preferences.allowInPersonContests) {
      score -= 6;
      notes.push("In-person appearance or pickup may be required; profile currently allows these.");
    } else {
      score -= 45;
      notes.push("Skipped by preference: in-person appearance or pickup appears required.");
    }
  }

  if (!notes.length) {
    notes.push("Location eligibility is unclear until official rules are extracted.");
  }

  return {
    score: clamp(score, 0, 100),
    localRegion,
    requiresInPersonAppearance,
    notes: [...new Set(notes)],
  };
}

function isStateAllowed(profileState: string, allowedStates: string[]) {
  if (!allowedStates.length) return null;
  const normalized = allowedStates.map((state) => state.trim().toUpperCase()).filter(Boolean);
  if (!normalized.length || normalized.some((state) => state === "ALL" || state === "ANY")) return true;
  if (!profileState) return null;
  return normalized.includes(profileState);
}

function appendStateIfMissing(value: string, state: string) {
  if (!state || value.toUpperCase().includes(state)) return value;
  return `${value} ${state}`;
}

function uniqueCompact(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.replace(/\s+/g, " ").trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function normalizeForMatch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function hasToken(haystack: string, token: string) {
  return new RegExp(`(?:^| )${escapeRegExp(token)}(?: |$)`).test(haystack);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}
