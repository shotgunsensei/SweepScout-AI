import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import { LoadingSkeleton, Panel } from "@/components/ui";
import { cn } from "@/lib/utils";

export function EmptyState(props: { title: string; body: string; action?: React.ReactNode; image?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-panel-strong/30 p-8 text-center">
      {props.image ? (
        <img src={props.image} alt="" className="mx-auto mb-5 h-32 w-32 rounded-full object-cover opacity-80 mix-blend-screen" />
      ) : (
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl border border-line bg-panel">
          <Inbox size={20} className="text-muted" aria-hidden />
        </div>
      )}
      <h3 className="mx-auto text-balance text-base font-semibold text-foreground">{props.title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-pretty text-sm leading-6 text-muted">{props.body}</p>
      {props.action ? <div className="mt-5 flex justify-center">{props.action}</div> : null}
    </div>
  );
}

export function LoadingState(props: { title?: string }) {
  return (
    <div className="grid gap-4" role="status" aria-live="polite">
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
    <Panel role="alert">
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
