import type { NextRequest } from "next/server";
import { requireParent } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, HttpError, json, parseJson } from "@/lib/http";
import { getOwnedChild, toDateOrNull } from "@/lib/parent-data";
import { talkingPointSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  const parent = await requireParent();
  const { id } = await ctx.params;
  await getOwnedChild(id, parent);
  const talkingPoints = await db.talkingPoint.findMany({ where: { childId: id }, orderBy: { createdAt: "desc" } });
  return json({ talkingPoints });
});

export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const { id } = await ctx.params;
  await getOwnedChild(id, parent);
  const body = await parseJson(req, talkingPointSchema);
  if ((await db.talkingPoint.count({ where: { childId: id } })) >= 60) {
    throw new HttpError(400, "too_many", "That's a lot of talking points! Remove a few old ones first.");
  }
  const talkingPoint = await db.talkingPoint.create({
    data: { ...body, expiresAt: toDateOrNull(body.expiresAt) ?? null, childId: id },
  });
  return json({ talkingPoint }, { status: 201 });
});
