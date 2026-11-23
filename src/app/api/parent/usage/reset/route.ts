import type { NextRequest } from "next/server";
import { requireOwner } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, json, notFound, parseJson } from "@/lib/http";
import { usageResetSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Owner-only: gives a child (or every child) a fresh daily and weekly allowance from now.
 * Call history and the monthly spending view are untouched.
 */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const owner = await requireOwner();
  const { childId } = await parseJson(req, usageResetSchema);
  const now = new Date();
  if (childId) {
    const { count } = await db.child.updateMany({ where: { id: childId, familyId: owner.familyId }, data: { limitsResetAt: now } });
    if (count === 0) throw notFound("We couldn't find that child.");
    return json({ ok: true, reset: 1 });
  }
  const { count } = await db.child.updateMany({ where: { familyId: owner.familyId }, data: { limitsResetAt: now } });
  return json({ ok: true, reset: count });
});
