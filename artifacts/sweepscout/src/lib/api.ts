const API_BASE = "/api";

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: string };

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204 && res.ok) return undefined as T;
  const text = await res.text();
  let payload: ApiEnvelope<T> | null = null;
  if (text) {
    try {
      payload = JSON.parse(text) as ApiEnvelope<T>;
    } catch {
      payload = null;
    }
  }
  if (!res.ok || !payload || payload.ok === false) {
    const message = payload && payload.ok === false ? payload.error : res.statusText || "Request failed";
    if (res.status === 401) window.dispatchEvent(new Event("play-pack-pilot-session-expired"));
    throw new ApiError(message, res.status);
  }
  return payload.data;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  return parse<T>(res);
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PUT",
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(csrfToken() ? { "X-CSRF-Token": csrfToken()! } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  return parse<T>(res);
}

export function apiUrl(path: string) {
  return `${API_BASE}${path}`;
}

function csrfToken() {
  const match = document.cookie.split("; ").find((value) => value.startsWith("ppp_csrf="));
  return match ? decodeURIComponent(match.slice("ppp_csrf=".length)) : null;
}
