import type { NextRequest } from "next/server";
import { destroyParentSession, requireParent } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, json, parseJson } from "@/lib/http";
import { sweepCalls } from "@/lib/calls/lifecycle";
import { dataDeletionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Parent-controlled data deletion. Requires typing DELETE to confirm. */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const { scope } = await parseJson(req, dataDeletionSchema);
  const familyId = parent.familyId;
  const childScope = { child: { familyId } };

  switch (scope) {
    case "call_history":
      await db.call.deleteMany({ where: { ...childScope, status: { notIn: ["ACTIVE", "CONNECTING"] } } });
      break;
    case "memories":
      await db.memory.deleteMany({ where: childScope });
      break;
    case "all_child_data":
      await db.family.update({ where: { id: familyId }, data: { callingEnabled: false } });
      await sweepCalls(familyId);
      await db.child.deleteMany({ where: { familyId } });
      break;
    case "everything":
      await db.family.update({ where: { id: familyId }, data: { callingEnabled: false } });
      await sweepCalls(familyId);
      await destroyParentSession();
      await db.family.delete({ where: { id: familyId } });
      return json({ ok: true, signedOut: true });
  }
  return json({ ok: true });
});
