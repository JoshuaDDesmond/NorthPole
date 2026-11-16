import type { NextRequest } from "next/server";
import { requireParent } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, badRequest, handle, json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { sniffImageType } from "@/lib/image";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024;

export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  await rateLimit(`photo:${parent.familyId}`, 30, 3600);
  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!file || typeof file === "string") throw badRequest("Please choose a photo to upload.");
  if (file.size > MAX_BYTES) throw badRequest("That photo is too large. Please use one under 2 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniffImageType(buf);
  if (!type) throw badRequest("Please upload a JPEG, PNG or WebP image.");
  await db.family.update({
    where: { id: parent.familyId },
    data: { santaPhoto: buf, santaPhotoType: type, santaPhotoUpdatedAt: new Date() },
  });
  return json({ ok: true });
});

export const DELETE = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const parent = await requireParent();
  await db.family.update({
    where: { id: parent.familyId },
    data: { santaPhoto: null, santaPhotoType: null, santaPhotoUpdatedAt: new Date() },
  });
  return json({ ok: true });
});
