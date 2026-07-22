import type { CalendarEvent } from "./types";

export function buildCalendar(events: CalendarEvent[], calendarName = "Play Pack Pilot Flight Plan") {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Shotgun Ninjas Productions//Play Pack Pilot//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapeIcs(calendarName)}`];
  for (const event of events) {
    lines.push("BEGIN:VEVENT", `UID:${escapeIcs(event.uid)}`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(new Date(event.startsAt))}`);
    if (event.endsAt) lines.push(`DTEND:${icsDate(new Date(event.endsAt))}`);
    lines.push(`SUMMARY:${escapeIcs(event.title)}`, `DESCRIPTION:${escapeIcs(`${event.description} Timezone: ${event.timezone}. Verify official sponsor rules.`)}`);
    if (event.url) lines.push(`URL:${escapeIcs(event.url)}`);
    if (event.recurrence) lines.push(`RRULE:FREQ=${event.recurrence.toUpperCase()}${event.recurrenceUntil ? `;UNTIL=${icsDate(new Date(event.recurrenceUntil))}` : ""}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR"); return `${lines.join("\r\n")}\r\n`;
}
function icsDate(date: Date) { if (!Number.isFinite(date.getTime())) throw new Error("Calendar event contains an invalid date."); return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }
function escapeIcs(value: string) { return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
