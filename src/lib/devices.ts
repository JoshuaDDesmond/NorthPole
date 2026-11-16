import "server-only";
import type { ParentContext } from "./auth/session";
import { db } from "./db";

/** Active paired devices visible to this parent (their own; the owner sees all in the family). */
export async function listDevices(parent: ParentContext) {
  const devices = await db.familyDevice.findMany({
    where: {
      familyId: parent.familyId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      ...(parent.isOwner ? {} : { parentUserId: parent.userId }),
    },
    orderBy: { lastSeenAt: "desc" },
    include: { parentUser: { select: { name: true, accessVersion: true } } },
  });
  return devices
    .filter((d) => d.accessVersion === d.parentUser.accessVersion)
    .map((d) => ({
      id: d.id,
      label: d.label,
      parentName: d.parentUser.name,
      mine: d.parentUserId === parent.userId,
      createdAt: d.createdAt.toISOString(),
      lastSeenAt: d.lastSeenAt.toISOString(),
    }));
}
