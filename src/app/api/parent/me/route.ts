import type { NextRequest } from "next/server";
import { requireParent } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, json, parseJson } from "@/lib/http";
import { meSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** The signed-in parent's own consent and display name. */
export const PATCH = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const body = await parseJson(req, meSchema);
  const me = await db.parentUser.update({
    where: { id: parent.userId },
    data: {
      ...(body.name ? { name: body.name } : {}),
      ...(body.householdNotes !== undefined ? { householdNotes: body.householdNotes } : {}),
      ...(body.consent === true ? { consentAt: new Date() } : body.consent === false ? { consentAt: null } : {}),
    },
    select: { id: true, name: true, consentAt: true, householdNotes: true },
  });
  return json({ me });
});
