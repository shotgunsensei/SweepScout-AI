import { AppShell } from "@/components/app-shell";
import { LoadingState, SkeletonPanel } from "@/components/dashboard-kit";

export default function DashboardLoading() {
  return (
    <AppShell>
      <LoadingState title="Loading dashboard workspace" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SkeletonPanel />
        <SkeletonPanel />
        <SkeletonPanel />
        <SkeletonPanel />
      </div>
    </AppShell>
  );
}
