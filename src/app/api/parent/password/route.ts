import type { NextRequest } from "next/server";
import { requireParent } from "@/lib/auth/session";
import { hashSecret, verifySecret } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, HttpError, json, parseJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { changePasswordSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  await rateLimit(`password:${parent.userId}`, 6, 15 * 60);
  const body = await parseJson(req, changePasswordSchema);
  const user = await db.parentUser.findUniqueOrThrow({ where: { id: parent.userId } });
  if (!(await verifySecret(body.currentPassword, user.passwordHash))) {
    throw new HttpError(401, "invalid_password", "Your current password isn't right.");
  }
  await db.parentUser.update({ where: { id: user.id }, data: { passwordHash: await hashSecret(body.newPassword), mustChangePassword: false } });
  return json({ ok: true });
});
