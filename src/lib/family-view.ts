import "server-only";
import { db } from "./db";

/** What a paired device shows: only the children managed by the parent whose code paired it. */
export async function getFamilyView(device: { familyId: string; parentUserId: string }) {
  const family = await db.family.findUnique({
    where: { id: device.familyId },
    select: {
      ambientSound: true,
      santaPhotoUpdatedAt: true,
      children: {
        where: { callingEnabled: true, access: { some: { parentUserId: device.parentUserId } } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, firstName: true, nickname: true },
      },
    },
  });
  if (!family) return null;
  const v = family.santaPhotoUpdatedAt?.getTime() ?? 0;
  return {
    ambientSound: family.ambientSound,
    photoUrl: `/api/santa-photo?v=${v}`,
    callers: family.children.map((c) => ({ id: c.id, name: c.nickname.trim() || c.firstName })),
  };
}
