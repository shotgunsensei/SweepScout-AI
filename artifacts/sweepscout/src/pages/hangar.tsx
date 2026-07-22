import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, FolderHeart, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorNotice, LoadingState, SectionHeader } from "@/components/dashboard-kit";
import { Badge, PageHeader, Panel, SubmitButton, TextInput } from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";
import type { HangarData, SearchProfile } from "@/lib/types";

export default function HangarPage() {
  const [sort, setSort] = useState("saved_desc"); const [priority, setPriority] = useState(""); const [status, setStatus] = useState(""); const [selected, setSelected] = useState<string[]>([]);
  const queryClient = useQueryClient();
  const hangar = useQuery({ queryKey: ["hangar", sort, priority, status], queryFn: () => apiGet<HangarData>(`/hangar?sort=${sort}&priority=${priority}&status=${status}`) });
  const profiles = useQuery({ queryKey: ["search-profiles"], queryFn: () => apiGet<SearchProfile[]>("/search-profile-alerts") });
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["hangar"] }); void queryClient.invalidateQueries({ queryKey: ["search-profiles"] }); };
  const bulk = useMutation({ mutationFn: (body: Record<string, unknown>) => apiSend("/hangar/bulk", "POST", body), onSuccess: () => { setSelected([]); refresh(); toast.success("Hangar updated"); }, onError: showError });
  const save = useMutation({ mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => apiSend(`/hangar/${id}`, "PUT", body), onSuccess: () => { refresh(); toast.success("Mission details saved"); }, onError: showError });
  const createProfile = useMutation({ mutationFn: (body: Record<string, unknown>) => apiSend("/search-profiles", "POST", body), onSuccess: refresh, onError: showError });
  const deleteProfile = useMutation({ mutationFn: (id: string) => apiSend(`/search-profiles/${id}`, "DELETE"), onSuccess: refresh, onError: showError });

  return <AppShell>
    <PageHeader title="The Hangar" kicker="Personal opportunity workspace" description="Prioritize saved missions, plan repeat entries, and keep private notes in one user-owned workspace." />
    <Panel className="mb-5"><div className="grid gap-3 md:grid-cols-3">
      <Select label="Sort" value={sort} onChange={setSort} options={[["saved_desc","Newest saved"],["saved_asc","Oldest saved"],["deadline","Deadline"],["priority","Priority"]]} />
      <Select label="Priority" value={priority} onChange={setPriority} options={[["","All priorities"],["high","High"],["normal","Normal"],["low","Low"]]} />
      <Select label="Status" value={status} onChange={setStatus} options={[["","All statuses"],["saved","Saved"],["entered","Entered"],["enter_again","Enter again"],["skipped","Skipped"]]} />
    </div>{selected.length ? <div className="mt-4 flex flex-wrap items-center gap-2"><Badge tone="ok">{selected.length} selected</Badge><button className="rounded-md border border-line px-3 py-2 text-sm" onClick={() => bulk.mutate({ ids: selected, action: "priority", value: "high" })}>Mark high priority</button><button className="rounded-md border border-line px-3 py-2 text-sm" onClick={() => bulk.mutate({ ids: selected, action: "status", value: "skipped" })}>Skip</button><button className="rounded-md bg-danger/15 px-3 py-2 text-sm text-danger" onClick={() => bulk.mutate({ ids: selected, action: "unsave" })}>Remove saved</button></div> : null}</Panel>
    {hangar.isLoading ? <LoadingState title="Opening the Hangar" /> : null}{hangar.isError ? <ErrorNotice title="Hangar unavailable" body="The personalized workspace could not be loaded." /> : null}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]"><div className="grid gap-3">{hangar.data?.items.map((item) => <Panel key={item.sweepstakesId}>
      <div className="flex items-start gap-3"><input aria-label={`Select ${item.title}`} type="checkbox" checked={selected.includes(item.sweepstakesId)} onChange={(event) => setSelected(event.target.checked ? [...selected,item.sweepstakesId] : selected.filter((id) => id !== item.sweepstakesId))} className="mt-1 size-4 accent-accent"/><div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><Link href={`/dashboard/sweepstakes/${item.sweepstakesId}`} className="font-semibold hover:text-accent">{item.title}</Link><Badge tone={item.priority === "high" ? "warn" : "default"}>{titleCase(item.priority)}</Badge><Badge>{titleCase(item.status)}</Badge></div>
        <p className="mt-2 text-sm text-muted">{item.sponsor} · {formatCurrency(item.prizeValue)} · {titleCase(item.frequency)}</p>
        <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-3"><span>Saved {formatDate(item.savedAt)}</span><span>Deadline {formatDate(item.deadline)}</span><span>Next entry {formatDate(item.nextEntryDueAt)}</span></div>
        <form className="mt-4 grid gap-2 sm:grid-cols-[9rem_1fr_auto]" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); save.mutate({ id: item.sweepstakesId, body: { priority: form.get("priority"), notes: form.get("notes") } }); }}><select name="priority" defaultValue={item.priority} className="h-10 rounded-md border border-line bg-panel-strong px-3 text-sm"><option value="high">High priority</option><option value="normal">Normal priority</option><option value="low">Low priority</option></select><TextInput name="notes" defaultValue={item.notes} placeholder="Private planning note" maxLength={4000}/><SubmitButton disabled={save.isPending}>Save</SubmitButton></form>
      </div></div>
    </Panel>)}{hangar.data && !hangar.data.items.length ? <EmptyState title="Your Hangar is clear" body="Save opportunities from Radar to create a focused mission queue." action={<FolderHeart className="text-accent"/>}/> : null}</div>
      <Panel><SectionHeader title="Saved radar profiles" eyebrow="Optional alerts" />
        <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); createProfile.mutate({ name: form.get("name"), filters: { q: form.get("q"), frequency: form.get("frequency") }, alertEnabled: form.get("alert") === "on" }); event.currentTarget.reset(); }}><TextInput name="name" required placeholder="Profile name" maxLength={120}/><TextInput name="q" placeholder="Keyword or sponsor"/><select name="frequency" className="h-10 rounded-md border border-line bg-panel-strong px-3 text-sm"><option value="">Any frequency</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="one_time">One time</option></select><label className="flex gap-2 text-sm"><input type="checkbox" name="alert" className="accent-accent"/>Alert when matches appear</label><SubmitButton disabled={createProfile.isPending}><Search size={15}/> Save radar profile</SubmitButton></form>
        <div className="mt-5 grid gap-2">{profiles.data?.map((profile) => <div key={profile.id} className="flex items-center justify-between rounded-md border border-line p-3"><div><p className="text-sm font-medium">{profile.name}</p><p className="text-xs text-muted">{profile.matchCount ?? 0} current matches · {profile.alert_enabled ? "alerts on" : "alerts off"}</p></div><button aria-label={`Delete ${profile.name}`} onClick={() => deleteProfile.mutate(profile.id)} className="text-muted hover:text-danger"><Trash2 size={16}/></button></div>)}</div>
        <a href="/api/personal/calendar.ics" className="mt-5 inline-flex items-center gap-2 text-sm text-accent"><CalendarClock size={16}/>Export mission calendar</a>
      </Panel>
    </div>
  </AppShell>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) { return <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-muted">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-md border border-line bg-panel-strong px-3 text-sm font-normal normal-case text-foreground">{options.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>; }
function showError(error: Error) { toast.error(error.message || "Update failed"); }
