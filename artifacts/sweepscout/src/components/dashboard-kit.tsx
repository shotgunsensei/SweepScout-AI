import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import { LoadingSkeleton, Panel } from "@/components/ui";
import { cn } from "@/lib/utils";

export function EmptyState(props: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-panel-strong/55 p-6 text-center">
      <div className="mx-auto flex size-10 items-center justify-center rounded-md border border-line bg-panel">
        <Inbox size={18} aria-hidden />
      </div>
      <h3 className="mt-3 text-balance text-sm font-semibold text-foreground">{props.title}</h3>
      <p className="mx-auto mt-2 max-w-md text-pretty text-sm leading-6 text-muted">{props.body}</p>
      {props.action ? <div className="mt-4 flex justify-center">{props.action}</div> : null}
    </div>
  );
}

export function LoadingState(props: { title?: string }) {
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3 rounded-md border border-line bg-panel px-4 py-3 text-sm text-muted">
        <Loader2 className="animate-spin text-accent" size={17} aria-hidden />
        {props.title ?? "Loading Play Pack Pilot"}
      </div>
      <LoadingSkeleton rows={3} />
    </div>
  );
}

export function ErrorNotice(props: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <Panel>
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 text-warning" size={20} aria-hidden />
        <div>
          <h2 className="text-balance text-base font-semibold text-foreground">{props.title}</h2>
          <p className="mt-2 text-pretty text-sm leading-6 text-muted">{props.body}</p>
          {props.action ? <div className="mt-4">{props.action}</div> : null}
        </div>
      </div>
    </Panel>
  );
}

export function SectionHeader(props: { title: string; eyebrow?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", props.className)}>
      <div>
        {props.eyebrow ? <p className="mb-1 text-xs font-semibold uppercase text-muted">{props.eyebrow}</p> : null}
        <h2 className="text-balance text-lg font-semibold text-foreground">{props.title}</h2>
      </div>
      {props.action ? <div className="flex flex-wrap gap-2">{props.action}</div> : null}
    </div>
  );
}

export function SkeletonPanel() {
  return (
    <div className="rounded-md border border-line bg-panel p-4">
      <div className="h-4 w-32 animate-pulse rounded bg-panel-strong" />
      <div className="mt-4 h-8 w-20 animate-pulse rounded bg-panel-strong" />
      <div className="mt-3 h-3 w-44 animate-pulse rounded bg-panel-strong" />
    </div>
  );
}
