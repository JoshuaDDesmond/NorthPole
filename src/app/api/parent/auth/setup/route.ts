import type { NextRequest } from "next/server";
import { createParentSession } from "@/lib/auth/session";
import { hashSecret, safeEqual } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { assertSameOrigin, clientIp, handle, HttpError, json, parseJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { isValidTimezone } from "@/lib/time";
import { setupSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * First-run setup. Only works while no parent account exists, and only with the
 * SETUP_TOKEN configured on the server, so a stranger can't claim the app.
 */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  await rateLimit(`setup:${clientIp(req)}`, 6, 15 * 60);
  const body = await parseJson(req, setupSchema);

  const expected = env.setupToken;
  if (!expected) throw new HttpError(503, "setup_disabled", "SETUP_TOKEN isn't configured on the server.");
  if (!safeEqual(body.setupToken, expected)) throw new HttpError(401, "invalid_setup_token", "That setup token isn't right.");
  if ((await db.parentUser.count()) > 0) throw new HttpError(409, "already_setup", "This app is already set up. Please sign in.");
  if (!isValidTimezone(body.timezone)) throw new HttpError(400, "invalid_timezone", "Please choose a valid time zone.");

  const passwordHash = await hashSecret(body.password);
  const family = await db.family.create({
    data: {
      name: body.familyName,
      timezone: body.timezone,
      personality: { create: {} },
      parents: { create: { name: body.name, email: body.email, passwordHash } },
    },
    include: { parents: true },
  });
  await createParentSession(family.parents[0]!.id);
  return json({ ok: true });
});
