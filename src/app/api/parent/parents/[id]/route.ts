import type { NextRequest } from "next/server";
import { requireOwner } from "@/lib/auth/session";
import { hashSecret } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { assertSameOrigin, badRequest, handle, json, notFound, parseJson } from "@/lib/http";
import { parentPatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function getTarget(id: string, familyId: string) {
  const target = await db.parentUser.findFirst({ where: { id, familyId } });
  if (!target) throw notFound("That parent account doesn't exist.");
  return target;
}

/** Owner updates a parent: role, which children they manage, or a temporary password reset. */
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const owner = await requireOwner();
  const { id } = await ctx.params;
  const target = await getTarget(id, owner.familyId);
  const body = await parseJson(req, parentPatchSchema);

  if (body.role === "PARENT" && target.role === "OWNER") {
    const owners = await db.parentUser.count({ where: { familyId: owner.familyId, role: "OWNER" } });
    if (owners <= 1) throw badRequest("The family needs at least one owner.");
  }

  await db.$transaction(async (tx) => {
    await tx.parentUser.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.role ? { role: body.role } : {}),
        ...(body.temporaryPassword ? { passwordHash: await hashSecret(body.temporaryPassword), mustChangePassword: true } : {}),
      },
    });
    if (body.temporaryPassword) await tx.parentSession.deleteMany({ where: { userId: id } });
    if (body.childIds) {
      const kids = await tx.child.findMany({ where: { id: { in: body.childIds }, familyId: owner.familyId }, select: { id: true } });
      const ids = kids.map((k) => k.id);
      await tx.childAccess.deleteMany({ where: { parentUserId: id, childId: { notIn: ids } } });
      await tx.childAccess.createMany({ data: ids.map((childId) => ({ parentUserId: id, childId })), skipDuplicates: true });
    }
  });
  return json({ ok: true });
});

/** Removes a parent's login. Their devices are disconnected; the children and their data stay. */
export const DELETE = handle(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const owner = await requireOwner();
  const { id } = await ctx.params;
  if (id === owner.userId) throw badRequest("You can't remove your own account while signed in.");
  await getTarget(id, owner.familyId);
  await db.parentUser.delete({ where: { id } });
  return json({ ok: true });
});
