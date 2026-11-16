import type { NextRequest } from "next/server";
import { requireParent } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, HttpError, json, parseJson } from "@/lib/http";
import { childWhere, validParentIds } from "@/lib/parent-data";
import { childSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const parent = await requireParent();
  const children = await db.child.findMany({
    where: childWhere(parent),
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return json({ children });
});

/** Creates a child. The creator always manages them; the owner may add other parents too. */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const { parentIds, ...body } = await parseJson(req, childSchema);
  const count = await db.child.count({ where: { familyId: parent.familyId } });
  if (count >= 30) throw new HttpError(400, "too_many_children", "You can add up to 30 children.");
  const managers = new Set([parent.userId]);
  if (parent.isOwner && parentIds) for (const id of await validParentIds(parentIds, parent.familyId)) managers.add(id);
  const child = await db.child.create({
    data: {
      ...body,
      customFields: body.customFields ?? [],
      familyId: parent.familyId,
      sortOrder: count,
      access: { create: [...managers].map((parentUserId) => ({ parentUserId })) },
    },
  });
  return json({ child }, { status: 201 });
});
