import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, CheckCircle2, Clock3, EyeOff, RotateCcw, SkipForward, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorNotice, LoadingState, SectionHeader } from "@/components/dashboard-kit";
import { Badge, MetricCard, PageHeader, Panel } from "@/components/ui";
import { apiGet, apiSend } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/format";
import type { MissionLogData, PersonalSweepstake } from "@/lib/types";

const groups: Array<{ key: keyof Pick<MissionLogData,"enteredToday"|"dailyDue"|"enteredPreviously"|"skipped"|"hidden"|"won"|"expired">; title: string; icon: typeof Clock3 }> = [
  { key: "dailyDue", title: "Daily entries due", icon: Clock3 }, { key: "enteredToday", title: "Entered today", icon: CheckCircle2 }, { key: "enteredPreviously", title: "Entered previously", icon: RotateCcw }, { key: "skipped", title: "Skipped", icon: SkipForward }, { key: "hidden", title: "Hidden", icon: EyeOff }, { key: "won", title: "Won", icon: Trophy }, { key: "expired", title: "Expired", icon: Clock3 },
];

export default function EntriesPage() {
  const queryClient = useQueryClient(); const mission = useQuery({ queryKey: ["mission-log"], queryFn: () => apiGet<MissionLogData>("/mission-log") });
  const status = useMutation({ mutationFn: ({ id, value }: { id: string; value: string }) => apiSend(`/opportunities/${id}/status`, "PUT", { status: value }), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["mission-log"] }); void queryClient.invalidateQueries({ queryKey: ["radar"] }); toast.success("Mission status updated"); }, onError: (error: Error) => toast.error(error.message) });
  return <AppShell><PageHeader title="Mission Log" kicker="User-reported entry history" description="Track attempts, repeat-entry windows, skipped missions, wins, and expired opportunities without overstating sponsor confirmation."><a href="/api/personal/calendar.ics" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-[#08110e]"><CalendarPlus size={16}/>Export calendar</a></PageHeader>
    {mission.isLoading ? <LoadingState title="Loading mission history"/> : null}{mission.isError ? <ErrorNotice title="Mission Log unavailable" body="Your personalized activity could not be loaded."/> : null}
    {mission.data ? <><Panel className="mb-5 border-warning/30 bg-warning/5"><p className="text-sm font-medium text-warning">Entry reporting boundary</p><p className="mt-1 text-sm text-muted">{mission.data.disclaimer}</p></Panel>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Entered today" value={mission.data.enteredToday.length} sublabel="self-reported" tone="ok"/><MetricCard label="Daily due" value={mission.data.dailyDue.length} sublabel="repeat windows" tone="warn"/><MetricCard label="Hidden" value={mission.data.hidden.length} sublabel="restorable"/><MetricCard label="Won" value={mission.data.won.length} sublabel="self-reported" tone="ok"/></div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">{groups.map(({key,title,icon:Icon}) => <Panel key={key}><SectionHeader title={title} action={<Badge>{mission.data![key].length}</Badge>}/><div className="grid gap-3">{mission.data![key].map((item) => <MissionItem key={`${key}-${item.sweepstakesId}`} item={item} onStatus={(value) => status.mutate({ id: item.sweepstakesId, value })} icon={<Icon size={16}/>}/>) }{!mission.data![key].length ? <EmptyState title={`No ${title.toLowerCase()}`} body="Nothing in this mission state right now."/> : null}</div></Panel>)}</div>
    </> : null}
  </AppShell>;
}

function MissionItem({ item, onStatus, icon }: { item: PersonalSweepstake; onStatus: (value: string) => void; icon: React.ReactNode }) { return <div className="rounded-md border border-line bg-panel-strong p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={`/dashboard/sweepstakes/${item.sweepstakesId}`} className="font-medium hover:text-accent">{item.title}</Link><p className="mt-1 text-xs text-muted">{item.sponsor} · {titleCase(item.frequency)} · deadline {formatDate(item.deadline)}</p></div><span className="text-accent">{icon}</span></div><div className="mt-3 flex flex-wrap items-center gap-2"><Badge>{item.entryCount} reported entries</Badge>{item.nextEntryDueAt ? <Badge tone="warn">Next {formatDate(item.nextEntryDueAt)}</Badge> : null}{item.status === "hidden" ? <button onClick={() => onStatus("interested")} className="rounded-md border border-line px-2 py-1 text-xs">Restore</button> : <button onClick={() => onStatus("hidden")} className="rounded-md border border-line px-2 py-1 text-xs">Hide</button>}{item.status !== "entered" ? <button onClick={() => onStatus("entered")} className="rounded-md bg-accent/15 px-2 py-1 text-xs text-accent">Report entered</button> : null}</div></div>; }
