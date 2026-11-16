import type { NextRequest } from "next/server";
import { requireParent } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, json, parseJson } from "@/lib/http";
import { getOwnedTalkingPoint, toDateOrNull } from "@/lib/parent-data";
import { talkingPointPatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const { id } = await ctx.params;
  await getOwnedTalkingPoint(id, parent);
  const body = await parseJson(req, talkingPointPatchSchema);
  const talkingPoint = await db.talkingPoint.update({
    where: { id },
    data: { ...body, expiresAt: toDateOrNull(body.expiresAt) },
  });
  return json({ talkingPoint });
});

export const DELETE = handle(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const { id } = await ctx.params;
  await getOwnedTalkingPoint(id, parent);
  await db.talkingPoint.delete({ where: { id } });
  return json({ ok: true });
});
