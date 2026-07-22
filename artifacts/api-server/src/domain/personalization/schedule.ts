export function nextEntryDue(input: { frequency: string; enteredAt: string; timezone: string; endAt: string | null }) {
  const days = input.frequency === "daily" ? 1 : input.frequency === "weekly" ? 7 : null;
  let next: Date | null = days ? addZoned(input.enteredAt, input.timezone, { days }) : input.frequency === "monthly" ? addZoned(input.enteredAt, input.timezone, { months: 1 }) : null;
  if (!next || !Number.isFinite(next.getTime())) return null;
  if (input.endAt && next.getTime() > Date.parse(input.endAt)) return null;
  return next.toISOString();
}

export function isDue(nextEntryDueAt: string | null, now = new Date()) { return Boolean(nextEntryDueAt && Date.parse(nextEntryDueAt) <= now.getTime()); }
export function shouldTransitionToExpired(status: string, endAt: string | null, now = new Date()) { return Boolean(endAt && Date.parse(endAt) <= now.getTime() && ["interested", "saved", "entered", "enter_again"].includes(status)); }

function addZoned(instant: string, timezone: string, increment: { days?: number; months?: number }) {
  const source = new Date(instant); if (!Number.isFinite(source.getTime())) return null;
  const parts = zonedParts(source, timezone); if (!parts) return null;
  const local = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  if (increment.days) local.setUTCDate(local.getUTCDate() + increment.days);
  if (increment.months) local.setUTCMonth(local.getUTCMonth() + increment.months);
  return localToInstant(local, timezone);
}
function zonedParts(date: Date, timezone: string) { try { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date); const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value); return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") }; } catch { return null; } }
function localToInstant(local: Date, timezone: string) { let guess = new Date(local.getTime()); for (let iteration = 0; iteration < 3; iteration += 1) { const represented = zonedParts(guess, timezone); if (!represented) return null; const representedUtc = Date.UTC(represented.year, represented.month - 1, represented.day, represented.hour, represented.minute, represented.second); guess = new Date(guess.getTime() + (local.getTime() - representedUtc)); } return guess; }
