import { getSupabaseServiceClient } from "@/lib/auth/session";
import { buildCalendar } from "./calendar";
import { shouldTransitionToExpired } from "./schedule";

const statuses = new Set(["interested", "saved", "entered", "enter_again", "skipped", "hidden", "won", "expired"]);
const priorities = new Set(["low", "normal", "high"]);
const sweepstakeFields = "id,title,sponsor_name,official_url,end_at,timezone,entry_frequency,estimated_total_prize_value,currency";

export class PersonalizationRepository {
  private readonly client: any = getSupabaseServiceClient();

  async hangar(userId: string, input: Record<string, unknown>) {
    let query = this.client.from("user_saved_sweepstakes").select(`sweepstakes_id,saved_at,priority,notes,sweepstakes(${sweepstakeFields})`).eq("user_id", userId);
    const priority = String(input.priority ?? "");
    if (priorities.has(priority)) query = query.eq("priority", priority);
    const result = await query.order("saved_at", { ascending: String(input.sort ?? "saved_desc") === "saved_asc" });
    if (result.error) throw new Error("Unable to load the Hangar.");
    const ids = (result.data ?? []).map((row: any) => row.sweepstakes_id);
    const states = ids.length ? await this.client.from("user_sweepstakes_status").select("sweepstakes_id,status,last_entered_at,next_entry_due_at,entry_count,updated_at").eq("user_id", userId).in("sweepstakes_id", ids) : { data: [], error: null };
    if (states.error) throw new Error("Unable to load personal mission state.");
    const stateById = new Map((states.data ?? []).map((row: any) => [row.sweepstakes_id, row]));
    let items = (result.data ?? []).map((row: any) => mapPersonalItem({ ...row, user_sweepstakes_status: stateById.get(row.sweepstakes_id) }));
    const status = String(input.status ?? "");
    if (statuses.has(status)) items = items.filter((item: any) => item.status === status);
    if (String(input.sort ?? "") === "deadline") items.sort((a: any, b: any) => Date.parse(a.deadline ?? "9999") - Date.parse(b.deadline ?? "9999"));
    if (String(input.sort ?? "") === "priority") items.sort((a: any, b: any) => priorityRank(a.priority) - priorityRank(b.priority));
    return { items, total: items.length };
  }

  async updateSaved(userId: string, sweepstakesId: string, body: Record<string, unknown>) {
    const priority = String(body.priority ?? "normal");
    const notes = String(body.notes ?? "").trim().slice(0, 4000);
    if (!priorities.has(priority)) throw new Error("Invalid saved priority.");
    const result = await this.client.from("user_saved_sweepstakes").update({ priority, notes }).eq("user_id", userId).eq("sweepstakes_id", sweepstakesId).select("sweepstakes_id").maybeSingle();
    if (result.error || !result.data) throw new Error("Saved opportunity was not found.");
    return { sweepstakesId, priority, notes };
  }

  async bulk(userId: string, body: Record<string, unknown>) {
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(String))].slice(0, 100) : [];
    if (!ids.length) throw new Error("Select at least one opportunity.");
    const action = String(body.action ?? "");
    let result: any;
    if (action === "unsave") result = await this.client.from("user_saved_sweepstakes").delete().eq("user_id", userId).in("sweepstakes_id", ids);
    else if (action === "priority" && priorities.has(String(body.value))) result = await this.client.from("user_saved_sweepstakes").update({ priority: String(body.value) }).eq("user_id", userId).in("sweepstakes_id", ids);
    else if (action === "status" && statuses.has(String(body.value))) result = await this.client.from("user_sweepstakes_status").upsert(ids.map((id) => ({ user_id: userId, sweepstakes_id: id, status: String(body.value), updated_at: new Date().toISOString() })), { onConflict: "user_id,sweepstakes_id" });
    else throw new Error("Invalid bulk action.");
    if (result.error) throw new Error("Unable to apply the bulk action.");
    return { updated: ids.length, action };
  }

  async missionLog(userId: string) {
    const result = await this.client.from("user_sweepstakes_status").select(`sweepstakes_id,status,last_entered_at,next_entry_due_at,entry_count,updated_at,sweepstakes(${sweepstakeFields})`).eq("user_id", userId).order("updated_at", { ascending: false });
    if (result.error) throw new Error("Unable to load the Mission Log.");
    const now = new Date();
    const expiredIds: string[] = [];
    const items = (result.data ?? []).map((row: any) => {
      if (row.status !== "expired" && shouldTransitionToExpired(row.status, row.sweepstakes?.end_at, now)) { row.status = "expired"; expiredIds.push(row.sweepstakes_id); }
      return mapPersonalItem(row);
    });
    if (expiredIds.length) await this.client.from("user_sweepstakes_status").update({ status: "expired", updated_at: now.toISOString() }).eq("user_id", userId).in("sweepstakes_id", expiredIds);
    const today = now.toISOString().slice(0, 10);
    return {
      enteredToday: items.filter((x: any) => x.lastEnteredAt?.slice(0, 10) === today),
      dailyDue: items.filter((x: any) => x.status === "enter_again" || (x.nextEntryDueAt && Date.parse(x.nextEntryDueAt) <= now.getTime() && x.status === "entered")),
      enteredPreviously: items.filter((x: any) => x.status === "entered" && x.lastEnteredAt?.slice(0, 10) !== today),
      skipped: items.filter((x: any) => x.status === "skipped"), hidden: items.filter((x: any) => x.status === "hidden"),
      won: items.filter((x: any) => x.status === "won"), expired: items.filter((x: any) => x.status === "expired"),
      disclaimer: "Entry activity is user-reported. Play Pack Pilot does not claim sponsor receipt or confirmation without an authorized integration.",
    };
  }

  async notes(userId: string, sweepstakesId: string) { const result = await this.client.from("user_sweepstakes_notes").select("id,note,created_at,updated_at").eq("user_id", userId).eq("sweepstakes_id", sweepstakesId).order("created_at", { ascending: false }); if (result.error) throw new Error("Unable to load notes."); return result.data ?? []; }
  async addNote(userId: string, sweepstakesId: string, noteInput: unknown) { const note = requiredText(noteInput, 4000, "Note is required."); const result = await this.client.from("user_sweepstakes_notes").insert({ user_id: userId, sweepstakes_id: sweepstakesId, note }).select("id,note,created_at,updated_at").single(); if (result.error) throw new Error("Unable to add note."); return result.data; }
  async updateNote(userId: string, id: string, noteInput: unknown) { const note = requiredText(noteInput, 4000, "Note is required."); const result = await this.client.from("user_sweepstakes_notes").update({ note, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId).select("id,note,created_at,updated_at").maybeSingle(); if (result.error || !result.data) throw new Error("Note was not found."); return result.data; }
  async deleteNote(userId: string, id: string) { const result = await this.client.from("user_sweepstakes_notes").delete().eq("id", id).eq("user_id", userId); if (result.error) throw new Error("Unable to delete note."); return { deleted: true }; }

  async profiles(userId: string) { const result = await this.client.from("user_search_profiles").select("id,name,filters,alert_enabled,created_at,updated_at").eq("user_id", userId).order("created_at"); if (result.error) throw new Error("Unable to load saved searches."); return result.data ?? []; }
  async createProfile(userId: string, body: Record<string, unknown>) { const name = requiredText(body.name, 120, "Search profile name is required."); const result = await this.client.from("user_search_profiles").insert({ user_id: userId, name, filters: sanitizeFilters(body.filters), alert_enabled: body.alertEnabled === true }).select("id,name,filters,alert_enabled,created_at,updated_at").single(); if (result.error) throw new Error("Unable to create the saved search."); return result.data; }
  async updateProfile(userId: string, id: string, body: Record<string, unknown>) { const name = requiredText(body.name, 120, "Search profile name is required."); const result = await this.client.from("user_search_profiles").update({ name, filters: sanitizeFilters(body.filters), alert_enabled: body.alertEnabled === true, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId).select("id,name,filters,alert_enabled,created_at,updated_at").maybeSingle(); if (result.error || !result.data) throw new Error("Saved search was not found."); return result.data; }
  async deleteProfile(userId: string, id: string) { const result = await this.client.from("user_search_profiles").delete().eq("id", id).eq("user_id", userId); if (result.error) throw new Error("Unable to delete the saved search."); return { deleted: true }; }
  async profileAlerts(userId: string) {
    const profiles = (await this.profiles(userId)).filter((profile: any) => profile.alert_enabled);
    return Promise.all(profiles.map(async (profile: any) => {
      const f = profile.filters ?? {};
      const result = await this.client.rpc("search_sweepstakes_radar", { p_user_id: userId, p_query: f.q ?? null, p_category: f.category ?? null, p_min_prize: f.minPrize ?? null, p_deadline_before: null, p_start_after: null, p_frequency: f.frequency ?? null, p_max_effort: null, p_country: null, p_region: null, p_user_age: null, p_sponsor: null, p_purchase_required: null, p_social_required: null, p_min_legitimacy: null, p_min_source_confidence: null, p_saved: null, p_entered: null, p_sort: "recommended", p_limit: 1, p_offset: 0 });
      if (result.error) throw new Error("Unable to evaluate saved-search alerts.");
      return { ...profile, matchCount: Number(result.data?.[0]?.total_count ?? 0) };
    }));
  }

  async calendar(userId: string) { const data = await this.missionLog(userId); const rows = [...new Map([...data.dailyDue, ...data.enteredPreviously].filter((x: any) => x.deadline).map((x: any) => [x.sweepstakesId, x])).values()] as any[]; return buildCalendar(rows.map((x: any) => ({ uid: `${x.sweepstakesId}@playpackpilot.com`, title: `${x.title} entry window`, description: "Personal entry reminder. Entry status is user-reported.", startsAt: x.nextEntryDueAt ?? x.deadline, endsAt: x.deadline, timezone: x.timezone, recurrence: ["daily", "weekly", "monthly"].includes(x.frequency) ? x.frequency : null, recurrenceUntil: x.deadline, url: x.officialUrl }))); }
}

function mapPersonalItem(row: any) { const sweepstake = row.sweepstakes ?? {}; const state = Array.isArray(row.user_sweepstakes_status) ? row.user_sweepstakes_status[0] : row.user_sweepstakes_status ?? row; return { sweepstakesId: row.sweepstakes_id, title: sweepstake.title, sponsor: sweepstake.sponsor_name, officialUrl: sweepstake.official_url, savedAt: row.saved_at ?? null, priority: row.priority ?? "normal", notes: row.notes ?? "", deadline: sweepstake.end_at, timezone: sweepstake.timezone ?? "UTC", frequency: sweepstake.entry_frequency ?? "unknown", prizeValue: sweepstake.estimated_total_prize_value === null ? null : Number(sweepstake.estimated_total_prize_value), currency: sweepstake.currency ?? "USD", status: state?.status ?? "saved", lastEnteredAt: state?.last_entered_at ?? null, nextEntryDueAt: state?.next_entry_due_at ?? null, entryCount: Number(state?.entry_count ?? 0), updatedAt: state?.updated_at ?? row.saved_at ?? null }; }
function priorityRank(value: string) { return value === "high" ? 0 : value === "low" ? 2 : 1; }
function requiredText(value: unknown, max: number, message: string) { const text = String(value ?? "").trim().slice(0, max); if (!text) throw new Error(message); return text; }
function sanitizeFilters(value: unknown) { const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; const allowed = ["q", "category", "minPrize", "frequency"]; return Object.fromEntries(allowed.filter((key) => source[key] !== undefined && ["string", "number"].includes(typeof source[key])).map((key) => [key, source[key]])); }
