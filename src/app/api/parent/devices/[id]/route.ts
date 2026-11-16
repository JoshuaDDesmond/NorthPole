import type { NextRequest } from "next/server";
import { requireParent } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, json, notFound } from "@/lib/http";

export const dynamic = "force-dynamic";

export const DELETE = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const { id } = await ctx.params;
  const { count } = await db.familyDevice.updateMany({
    where: { id, familyId: parent.familyId, revokedAt: null, ...(parent.isOwner ? {} : { parentUserId: parent.userId }) },
    data: { revokedAt: new Date() },
  });
  if (!count) throw notFound("That device isn't connected.");
  return json({ ok: true });
});
