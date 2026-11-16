import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = (msg = "Please sign in to continue.") => new HttpError(401, "unauthorized", msg);
export const forbidden = (msg = "You don't have access to that.") => new HttpError(403, "forbidden", msg);
export const notFound = (msg = "Not found.") => new HttpError(404, "not_found", msg);
export const badRequest = (msg: string, code = "bad_request") => new HttpError(400, code, msg);

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
  });
}

/**
 * Reject cross-site state-changing requests. Cookies are SameSite=Lax already;
 * this is defense in depth against CSRF from other origins.
 */
export function assertSameOrigin(req: NextRequest | Request) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin) {
    // Browsers always send Origin on cross-origin POSTs; same-origin fetch/beacon also sends it.
    // Non-browser clients without cookies are rejected later by auth anyway.
    const fetchSite = req.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
      throw forbidden("Cross-site request blocked.");
    }
    return;
  }
  try {
    const originHost = new URL(origin).host;
    if (!host || originHost !== host) throw forbidden("Cross-site request blocked.");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw forbidden("Cross-site request blocked.");
  }
}

export function clientIp(req: NextRequest | Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function parseJson<T>(req: Request, schema: ZodType<T>, maxBytes = 64_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "too_large", "That request was too large.");
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw badRequest("Invalid JSON body.");
  }
  return schema.parse(raw);
}

/** Wrap a route handler with consistent, non-leaky error handling. */
export function handle<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: { code: err.code, message: err.message } }, { status: err.status });
      }
      if (err instanceof ZodError) {
        const first = err.issues[0];
        const path = first?.path?.join(".");
        return json(
          {
            error: {
              code: "validation_error",
              message: first ? `${path ? path + ": " : ""}${first.message}` : "Invalid input.",
            },
          },
          { status: 400 },
        );
      }
      // Never log request bodies: they can contain child profile details.
      console.error("[api] unexpected error:", err instanceof Error ? err.name + ": " + err.message : "unknown");
      return json({ error: { code: "server_error", message: "Something went wrong on our end." } }, { status: 500 });
    }
  };
}
