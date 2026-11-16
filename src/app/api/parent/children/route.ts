import type { NextRequest } from "next/server";
import { requireParent } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, HttpError, json, parseJson } from "@/lib/http";
import { childSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const parent = await requireParent();
  const children = await db.child.findMany({
    where: { familyId: parent.familyId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return json({ children });
});

export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const body = await parseJson(req, childSchema);
  const count = await db.child.count({ where: { familyId: parent.familyId } });
  if (count >= 12) throw new HttpError(400, "too_many_children", "You can add up to 12 children.");
  const child = await db.child.create({
    data: { ...body, customFields: body.customFields ?? [], familyId: parent.familyId, sortOrder: count },
  });
  return json({ child }, { status: 201 });
});
