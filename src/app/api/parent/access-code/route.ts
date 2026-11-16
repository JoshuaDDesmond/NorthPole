import type { NextRequest } from "next/server";
import { requireParent } from "@/lib/auth/session";
import { hashSecret } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, json, parseJson } from "@/lib/http";
import { accessCodeSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Sets (or changes) the family access code children use to connect a device.
 * Changing it disconnects every previously paired device.
 */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const { code } = await parseJson(req, accessCodeSchema);
  await db.family.update({
    where: { id: parent.familyId },
    data: { familyAccessCodeHash: await hashSecret(code), familyAccessVersion: { increment: 1 } },
  });
  return json({ ok: true });
});
