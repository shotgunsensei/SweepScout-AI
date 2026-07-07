import { useMutation, useQueryClient } from "@tanstack/react-query";

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: string };

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function getOrigin() {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (!domain) {
    return "";
  }
  return domain.startsWith("http://") || domain.startsWith("https://") ? domain.replace(/\/$/, "") : `https://${domain}`;
}

function getApiBase() {
  return `${getOrigin()}/api`;
}

async function parse<T>(res: Response): Promise<T> {
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
    throw new ApiError(message, res.status);
  }
  return payload.data;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: { Accept: "application/json" },
  });
  return parse<T>(res);
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PUT",
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return parse<T>(res);
}

export function apiUrl(path: string) {
  return `${getApiBase()}${path}`;
}

export function assetUrl(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${getOrigin()}${path}`;
}

export function useApiMutation<TResult = unknown>(
  path: string,
  options: { method?: "POST" | "PUT"; onSuccess?: (data: TResult) => void } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiSend<TResult>(path, options.method ?? "POST", body),
    onSuccess: async (data) => {
      await qc.invalidateQueries();
      options.onSuccess?.(data);
    },
  });
}
