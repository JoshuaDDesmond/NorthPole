import type { NextRequest } from "next/server";
import { destroyParentSession, requireParent } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, forbidden, handle, json, parseJson } from "@/lib/http";
import { finishCall, sweepCalls } from "@/lib/calls/lifecycle";
import { childWhere } from "@/lib/parent-data";
import { dataDeletionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Parent-controlled data deletion. Requires typing DELETE to confirm.
 * A parent can delete data for the children they manage; only the owner can
 * delete the entire family account.
 */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const { scope } = await parseJson(req, dataDeletionSchema);
  const kids = childWhere(parent);

  switch (scope) {
    case "call_history":
      await db.call.deleteMany({ where: { child: kids, status: { notIn: ["ACTIVE", "CONNECTING"] } } });
      break;
    case "memories":
      await db.memory.deleteMany({ where: { child: kids } });
      break;
    case "all_child_data": {
      const live = await db.call.findMany({ where: { child: kids, status: { in: ["ACTIVE", "CONNECTING"] } }, select: { id: true } });
      for (const c of live) await finishCall(c.id, "ENDED_BY_PARENT", "data_deleted");
      await db.child.deleteMany({ where: kids });
      break;
    }
    case "everything":
      if (!parent.isOwner) throw forbidden("Only the family owner can delete the whole account.");
      await db.family.update({ where: { id: parent.familyId }, data: { callingEnabled: false } });
      await sweepCalls(parent.familyId);
      await destroyParentSession();
      await db.family.delete({ where: { id: parent.familyId } });
      return json({ ok: true, signedOut: true });
  }
  return json({ ok: true });
});
