import type { NextRequest } from "next/server";
import { requireParent } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, json, parseJson } from "@/lib/http";
import { getOwnedChild } from "@/lib/parent-data";
import { childPatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  const parent = await requireParent();
  const { id } = await ctx.params;
  const child = await getOwnedChild(id, parent.familyId);
  return json({ child });
});

export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const { id } = await ctx.params;
  await getOwnedChild(id, parent.familyId);
  const body = await parseJson(req, childPatchSchema);
  const child = await db.child.update({ where: { id }, data: body });
  return json({ child });
});

/** Permanently deletes the child and everything about them (talking points, memories, call history). */
export const DELETE = handle(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const { id } = await ctx.params;
  await getOwnedChild(id, parent.familyId);
  await db.child.delete({ where: { id } });
  return json({ ok: true });
});
