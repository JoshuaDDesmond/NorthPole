import type { NextRequest } from "next/server";
import { requireParent } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, json, parseJson } from "@/lib/http";
import { getOwnedChild } from "@/lib/parent-data";
import { memoryCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  const parent = await requireParent();
  const { id } = await ctx.params;
  await getOwnedChild(id, parent);
  const memories = await db.memory.findMany({ where: { childId: id }, orderBy: { createdAt: "desc" } });
  return json({ memories });
});

/** A memory written by a parent is approved immediately (parent info is authoritative). */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const { id } = await ctx.params;
  await getOwnedChild(id, parent);
  const { content } = await parseJson(req, memoryCreateSchema);
  const memory = await db.memory.create({
    data: { childId: id, content, status: "APPROVED", source: "PARENT", reviewedAt: new Date() },
  });
  return json({ memory }, { status: 201 });
});

/** Clear all saved memories (approved and proposed) for this child. */
export const DELETE = handle(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const { id } = await ctx.params;
  await getOwnedChild(id, parent);
  const { count } = await db.memory.deleteMany({ where: { childId: id } });
  return json({ ok: true, deleted: count });
});
