"use client";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Small JSON fetch helper for the parent dashboard. */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
      headers: opts.form ? undefined : { "Content-Type": "application/json" },
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "network", "Couldn't reach the server. Check your connection and try again.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
  if (res.status === 401 && typeof window !== "undefined" && path.startsWith("/api/parent")) {
    window.location.assign(new URL("/parent/login", window.location.origin));
  }
  if (!res.ok) throw new ApiError(res.status, data.error?.code ?? "error", data.error?.message ?? "Something went wrong.");
  return data as T;
}
