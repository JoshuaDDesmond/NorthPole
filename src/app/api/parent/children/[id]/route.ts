import type { NextRequest } from "next/server";
import { requireParent } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, forbidden, handle, json, parseJson } from "@/lib/http";
import { getOwnedChild, validParentIds } from "@/lib/parent-data";
import { childPatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  const parent = await requireParent();
  const { id } = await ctx.params;
  const child = await getOwnedChild(id, parent);
  return json({ child });
});

export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const { id } = await ctx.params;
  await getOwnedChild(id, parent);
  const { parentIds, ...body } = await parseJson(req, childPatchSchema);
  if (parentIds !== undefined && !parent.isOwner) throw forbidden("Only the family owner can change who manages a child.");
  const child = await db.$transaction(async (tx) => {
    const updated = await tx.child.update({ where: { id }, data: body });
    if (parentIds !== undefined) {
      const ids = await validParentIds(parentIds, parent.familyId);
      await tx.childAccess.deleteMany({ where: { childId: id, parentUserId: { notIn: ids } } });
      await tx.childAccess.createMany({ data: ids.map((parentUserId) => ({ parentUserId, childId: id })), skipDuplicates: true });
    }
    return updated;
  });
  return json({ child });
});

/** Permanently deletes the child and everything about them (talking points, memories, call history). */
export const DELETE = handle(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const { id } = await ctx.params;
  await getOwnedChild(id, parent);
  await db.child.delete({ where: { id } });
  return json({ ok: true });
});
