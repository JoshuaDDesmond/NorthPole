import type { NextRequest } from "next/server";
import { requireParent } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, json, parseJson } from "@/lib/http";
import { getOwnedMemory } from "@/lib/parent-data";
import { memoryPatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Edit and/or approve a memory. Only an explicit parent approval makes it usable by Santa. */
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const { id } = await ctx.params;
  await getOwnedMemory(id, parent.familyId);
  const body = await parseJson(req, memoryPatchSchema);
  const memory = await db.memory.update({
    where: { id },
    data: {
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(body.status === "APPROVED" ? { status: "APPROVED", reviewedAt: new Date() } : {}),
    },
  });
  return json({ memory });
});

/** Reject a proposed memory or delete an approved one. Either way it's gone for good. */
export const DELETE = handle(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const { id } = await ctx.params;
  await getOwnedMemory(id, parent.familyId);
  await db.memory.delete({ where: { id } });
  return json({ ok: true });
});
