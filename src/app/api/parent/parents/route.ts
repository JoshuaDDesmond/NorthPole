import type { NextRequest } from "next/server";
import { requireParent } from "@/lib/auth/session";
import { hashSecret } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, HttpError, json, parseJson } from "@/lib/http";
import { addParentSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const parent = await requireParent();
  const parents = await db.parentUser.findMany({
    where: { familyId: parent.familyId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, createdAt: true, lastLoginAt: true },
  });
  return json({ parents, currentUserId: parent.userId });
});

/** Add another parent/guardian account to this family. */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  const body = await parseJson(req, addParentSchema);
  if (await db.parentUser.findUnique({ where: { email: body.email } })) {
    throw new HttpError(409, "email_taken", "There's already an account with that email.");
  }
  const created = await db.parentUser.create({
    data: { familyId: parent.familyId, name: body.name, email: body.email, passwordHash: await hashSecret(body.password) },
    select: { id: true, name: true, email: true, createdAt: true, lastLoginAt: true },
  });
  return json({ parent: created }, { status: 201 });
});
