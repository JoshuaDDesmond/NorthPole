import type { NextRequest } from "next/server";
import { requireParent } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, badRequest, handle, json, notFound } from "@/lib/http";

export const dynamic = "force-dynamic";

export const DELETE = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const { id } = await ctx.params;
  if (id === parent.userId) throw badRequest("You can't remove your own account while signed in.");
  const target = await db.parentUser.findFirst({ where: { id, familyId: parent.familyId } });
  if (!target) throw notFound("That parent account doesn't exist.");
  await db.parentUser.delete({ where: { id } });
  return json({ ok: true });
});
