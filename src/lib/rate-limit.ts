import "server-only";
import { db } from "./db";
import { HttpError } from "./http";

/**
 * Fixed-window rate limiter backed by Postgres, so it works across serverless
 * instances without another service.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const bucket = await db.rateLimitBucket.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });
  if (bucket.count > limit) {
    const retryAfter = Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000);
    throw new HttpError(429, "rate_limited", `Too many attempts. Please wait ${Math.max(1, Math.ceil(retryAfter / 60))} minute(s) and try again.`);
  }
  // Opportunistic cleanup of old buckets (cheap, bounded).
  if (Math.random() < 0.02) {
    await db.rateLimitBucket.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 2 * 86400_000) } } });
  }
}
