import type { NextRequest } from "next/server";
import { requireParent } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, json, parseJson } from "@/lib/http";
import { getOwnedWish } from "@/lib/parent-data";
import { wishPatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Edit a wish, mark it purchased, or keep (approve) one that was heard on a call. */
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const { id } = await ctx.params;
  await getOwnedWish(id, parent);
  const body = await parseJson(req, wishPatchSchema);
  const wish = await db.wishListItem.update({
    where: { id },
    data: { ...body, ...(body.link !== undefined ? { link: body.link || null } : {}) },
  });
  return json({ wish });
});

export const DELETE = handle(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const { id } = await ctx.params;
  await getOwnedWish(id, parent);
  await db.wishListItem.delete({ where: { id } });
  return json({ ok: true });
});
