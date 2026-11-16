import type { NextRequest } from "next/server";
import { requireParent } from "@/lib/auth/session";
import { hashSecret, verifySecret } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, HttpError, json, parseJson } from "@/lib/http";
import { accessCodeSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Sets (or changes) this parent's own device code. A device paired with it
 * shows only the children this parent manages. Changing it disconnects every
 * device previously paired with this parent's code.
 */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const { code } = await parseJson(req, accessCodeSchema);

  // Codes must be unique across parents, otherwise a device couldn't tell whose it is.
  const others = await db.parentUser.findMany({
    where: { id: { not: parent.userId }, accessCodeHash: { not: null } },
    select: { accessCodeHash: true },
  });
  for (const o of others) {
    if (await verifySecret(code, o.accessCodeHash)) {
      throw new HttpError(409, "code_taken", "That code is already used by another parent. Please choose a different one.");
    }
  }

  await db.parentUser.update({
    where: { id: parent.userId },
    data: { accessCodeHash: await hashSecret(code), accessVersion: { increment: 1 } },
  });
  return json({ ok: true });
});
