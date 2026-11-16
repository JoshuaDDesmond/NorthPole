import type { NextRequest } from "next/server";
import { requireParent } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, HttpError, json, parseJson } from "@/lib/http";
import { getOwnedChild } from "@/lib/parent-data";
import { wishSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  const parent = await requireParent();
  const { id } = await ctx.params;
  await getOwnedChild(id, parent);
  const wishes = await db.wishListItem.findMany({
    where: { childId: id },
    orderBy: [{ approved: "asc" }, { topWish: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return json({ wishes });
});

/** A wish added by a parent is approved immediately. */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const { id } = await ctx.params;
  await getOwnedChild(id, parent);
  const body = await parseJson(req, wishSchema);
  const count = await db.wishListItem.count({ where: { childId: id } });
  if (count >= 100) throw new HttpError(400, "too_many", "That's a long list! Remove a few items first.");
  const wish = await db.wishListItem.create({
    data: { ...body, link: body.link || null, childId: id, source: "PARENT", approved: true, sortOrder: count },
  });
  return json({ wish }, { status: 201 });
});
