import type { NextRequest } from "next/server";
import { requireOwner, requireParent } from "@/lib/auth/session";
import { hashSecret } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, HttpError, json, parseJson } from "@/lib/http";
import { addParentSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const PARENT_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  lastLoginAt: true,
  consentAt: true,
  mustChangePassword: true,
  accessCodeHash: true,
  children: { select: { childId: true } },
} as const;

/** The owner sees every parent; other parents only see themselves. */
export const GET = handle(async () => {
  const parent = await requireParent();
  const rows = await db.parentUser.findMany({
    where: parent.isOwner ? { familyId: parent.familyId } : { id: parent.userId },
    orderBy: { createdAt: "asc" },
    select: PARENT_SELECT,
  });
  const parents = rows.map(({ accessCodeHash, children, ...p }) => ({ ...p, hasDeviceCode: Boolean(accessCodeHash), childIds: children.map((c) => c.childId) }));
  return json({ parents, currentUserId: parent.userId });
});

/**
 * Owner creates a login for another parent, with a temporary password they
 * must change on first sign-in, and chooses which children they manage.
 */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const owner = await requireOwner();
  const body = await parseJson(req, addParentSchema);
  if (await db.parentUser.findUnique({ where: { email: body.email } })) {
    throw new HttpError(409, "email_taken", "There's already an account with that email.");
  }
  const kids = await db.child.findMany({ where: { id: { in: body.childIds }, familyId: owner.familyId }, select: { id: true } });
  const created = await db.parentUser.create({
    data: {
      familyId: owner.familyId,
      name: body.name,
      email: body.email,
      role: body.role,
      passwordHash: await hashSecret(body.password),
      mustChangePassword: true,
      children: { create: kids.map((k) => ({ childId: k.id })) },
    },
    select: { id: true, name: true, email: true, role: true },
  });
  return json({ parent: created }, { status: 201 });
});
