import { safeEqual } from "@/lib/auth/password";
import { sweepCalls } from "@/lib/calls/lifecycle";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { handle, HttpError, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Optional scheduled cleanup (e.g. Vercel Cron). Requires Authorization: Bearer CRON_SECRET. */
export const GET = handle(async (req: Request) => {
  const secret = env.cronSecret;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) throw new HttpError(401, "unauthorized", "Unauthorized");
  await sweepCalls();
  await db.parentSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return json({ ok: true });
});
