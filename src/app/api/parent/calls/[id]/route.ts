import type { NextRequest } from "next/server";
import { requireParent } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, json, parseJson } from "@/lib/http";
import { getOwnedCall } from "@/lib/parent-data";
import { finishCall } from "@/lib/calls/lifecycle";
import { callSummaryPatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const { id } = await ctx.params;
  await getOwnedCall(id, parent);
  const body = await parseJson(req, callSummaryPatchSchema);
  const call = await db.call.update({
    where: { id },
    data: {
      ...(body.summary !== undefined ? { summary: body.summary || null, summaryStatus: body.summary ? undefined : "NONE" } : {}),
      ...(body.approve ? { summaryStatus: "APPROVED" } : {}),
      ...(body.clearSafetyFlag ? { safetyFlag: false, safetyNote: null } : {}),
    },
  });
  return json({ call });
});

/** Parent can hang up a live call remotely, or delete a past call's record. */
export const DELETE = handle(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const { id } = await ctx.params;
  const call = await getOwnedCall(id, parent);
  if (call.status === "ACTIVE" || call.status === "CONNECTING") {
    await finishCall(id, "ENDED_BY_PARENT", "parent_hangup");
    return json({ ok: true, hungUp: true });
  }
  await db.call.delete({ where: { id } });
  return json({ ok: true });
});
