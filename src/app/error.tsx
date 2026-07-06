"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-lg rounded-md border border-line bg-panel p-6">
        <p className="text-sm font-semibold uppercase text-danger">Request failed</p>
        <h1 className="mt-3 text-2xl font-semibold">SweepScout hit a blocking error.</h1>
        <p className="mt-3 text-sm text-muted">{error.message}</p>
        <button className="mt-5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-[#07100d]" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
