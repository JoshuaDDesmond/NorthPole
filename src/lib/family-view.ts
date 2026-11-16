import "server-only";
import { db } from "./db";

export async function getFamilyView(familyId: string) {
  const family = await db.family.findUnique({
    where: { id: familyId },
    select: {
      ambientSound: true,
      santaPhotoUpdatedAt: true,
      children: {
        where: { callingEnabled: true },
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
