import { NextResponse } from "next/server";
import { getFamilyDevice, getParent } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Serves the family's uploaded Santa contact photo, or the default portrait. */
export async function GET(req: Request) {
  const parent = await getParent();
  const device = parent ? null : await getFamilyDevice();
  const familyId = parent?.familyId ?? device?.familyId;

  if (familyId) {
    const family = await db.family.findUnique({
      where: { id: familyId },
      select: { santaPhoto: true, santaPhotoType: true },
    });
    if (family?.santaPhoto && family.santaPhotoType) {
      return new NextResponse(Buffer.from(family.santaPhoto), {
        headers: {
          "Content-Type": family.santaPhotoType,
          "Cache-Control": "private, max-age=300",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  }
  return NextResponse.redirect(new URL("/santa-default.webp", req.url), 307);
}
