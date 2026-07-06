"use client";

import { AppShell } from "@/components/app-shell";
import { ErrorNotice } from "@/components/dashboard-kit";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <AppShell>
      <ErrorNotice
        title="Dashboard request failed"
        body={error.message || "SweepScout could not load this workspace view."}
        action={
          <button className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-[#07100d]" onClick={reset}>
            Try again
          </button>
        }
      />
    </AppShell>
  );
}
