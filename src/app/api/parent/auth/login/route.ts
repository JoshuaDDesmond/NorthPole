import type { NextRequest } from "next/server";
import { createParentSession } from "@/lib/auth/session";
import { verifySecret } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { assertSameOrigin, clientIp, handle, HttpError, json, parseJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

// A fixed hash to compare against when the email is unknown, so timing doesn't reveal accounts.
const DUMMY_HASH = "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";

export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  await rateLimit(`login-ip:${clientIp(req)}`, 20, 15 * 60);
  const { email, password } = await parseJson(req, loginSchema);
  await rateLimit(`login-email:${email}`, 8, 15 * 60);

  const user = await db.parentUser.findUnique({ where: { email } });
  const ok = await verifySecret(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, "invalid_credentials", "That email and password don't match.");

  await createParentSession(user.id);
  return json({ ok: true });
});
