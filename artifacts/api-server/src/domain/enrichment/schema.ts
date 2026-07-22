import { z } from "zod";

const location = z.object({
  pageUrl: z.string().url(), section: z.string().max(200).nullable().optional(),
  startOffset: z.number().int().nonnegative().nullable().optional(), endOffset: z.number().int().nonnegative().nullable().optional(),
}).strict();
const field = <T extends z.ZodTypeAny>(value: T) => z.object({
  value: value.nullable(), confidence: z.number().min(0).max(1), sourceReference: z.string().min(1).max(500),
  evidence: z.string().max(1_500), location, extractedAt: z.string().datetime({ offset: true }),
}).strict();
const frequency = z.enum(["one_time", "daily", "weekly", "monthly", "unlimited", "unknown"]);
const prize = z.object({ name: z.string().min(1).max(300), quantity: z.number().int().positive().max(1_000_000), estimatedValue: z.number().nonnegative().max(1_000_000_000).nullable(), currency: z.string().length(3) }).strict();
const entryMethod = z.object({
  methodType: z.string().min(1).max(100), description: z.string().max(1_000), entryUrl: z.string().url().nullable(),
  frequency, purchaseRequired: z.boolean(), socialPlatform: z.string().max(100).nullable(),
  estimatedMinutes: z.number().int().min(0).max(1_440).nullable(),
}).strict();

export const sweepstakesExtractionSchema = z.object({
  title: field(z.string().min(1).max(500)), sponsor: field(z.string().min(1).max(300)),
  officialPromotionUrl: field(z.string().url()), officialRulesUrl: field(z.string().url()), officialPromotionId: field(z.string().max(300)),
  startDate: field(z.string().datetime({ offset: true })), endDate: field(z.string().datetime({ offset: true })), timezone: field(z.string().max(100)),
  prizes: field(z.array(prize).max(100)), eligibleLocations: field(z.array(z.string().max(200)).max(250)),
  minimumAge: field(z.number().int().min(0).max(130)), maximumAge: field(z.number().int().min(0).max(130)),
  entryMethods: field(z.array(entryMethod).max(50)), entryFrequency: field(frequency), purchaseRequirements: field(z.string().max(2_000)),
  socialMediaRequirements: field(z.array(z.string().max(500)).max(50)), employeeExclusions: field(z.string().max(2_000)),
  maximumEntries: field(z.number().int().positive().max(1_000_000)), sponsorContact: field(z.string().max(1_000)),
  voidWhereProhibited: field(z.boolean()), taxDisclosures: field(z.string().max(2_000)), winnerNotification: field(z.string().max(2_000)),
  categories: field(z.array(z.string().max(100)).max(20)),
}).strict();

export function parseSweepstakesExtraction(value: unknown) { return sweepstakesExtractionSchema.parse(value); }
