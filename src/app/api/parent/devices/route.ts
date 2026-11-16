import { requireParent } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const parent = await requireParent();
  const family = await db.family.findUniqueOrThrow({ where: { id: parent.familyId }, select: { familyAccessVersion: true } });
  const devices = await db.familyDevice.findMany({
    where: { familyId: parent.familyId, revokedAt: null, accessVersion: family.familyAccessVersion, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, label: true, createdAt: true, lastSeenAt: true, expiresAt: true },
  });
  return json({ devices });
});
