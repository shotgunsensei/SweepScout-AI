import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function jsonError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Unknown server error.";
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function jsonRateLimitError(message: string, resetAt: number) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      rateLimit: { resetAt: new Date(resetAt).toISOString() },
    },
    { status: 429 },
  );
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}
