import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-lg rounded-md border border-line bg-panel p-6">
        <p className="text-sm font-semibold uppercase text-accent">404</p>
        <h1 className="mt-3 text-2xl font-semibold">Page not found</h1>
        <Link href="/" className="mt-5 inline-flex rounded-md bg-accent px-4 py-2 text-sm font-medium text-[#07100d]">
          Dashboard
        </Link>
      </div>
    </main>
  );
}
