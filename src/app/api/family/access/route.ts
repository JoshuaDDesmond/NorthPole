import type { NextRequest } from "next/server";
import { createFamilyDevice, forgetFamilyDevice } from "@/lib/auth/session";
import { verifySecret } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { assertSameOrigin, clientIp, handle, HttpError, json, parseJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { familyAccessSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Pairs this browser with the family using the family access code a parent
 * set. The child never sees or needs parent credentials.
 */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  await rateLimit(`family-access:${clientIp(req)}`, 8, 15 * 60);
  const { code, label } = await parseJson(req, familyAccessSchema);

  const families = await db.family.findMany({
    where: { familyAccessCodeHash: { not: null } },
    select: { id: true, familyAccessCodeHash: true, familyAccessVersion: true },
    take: 20,
  });
  for (const f of families) {
    if (await verifySecret(code, f.familyAccessCodeHash)) {
      await createFamilyDevice(f.id, f.familyAccessVersion, label?.trim() || deviceLabel(req.headers.get("user-agent")));
      return json({ ok: true });
    }
  }
  throw new HttpError(401, "invalid_code", "That code didn't work. Double-check it with a parent.");
});

export const DELETE = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  await forgetFamilyDevice();
  return json({ ok: true });
});

function deviceLabel(ua: string | null) {
  if (!ua) return "Family device";
  if (/iPad/.test(ua)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return "Android device";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows computer";
  if (/CrOS/.test(ua)) return "Chromebook";
  return "Family device";
}
