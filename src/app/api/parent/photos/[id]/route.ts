import type { NextRequest } from "next/server";
import { requireParent } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, json, notFound } from "@/lib/http";
import { childWhere } from "@/lib/parent-data";

export const dynamic = "force-dynamic";

async function findPhoto(id: string) {
  const parent = await requireParent();
  const photo = await db.childPhoto.findFirst({ where: { id, child: childWhere(parent) }, select: { id: true, image: true, mimeType: true } });
  if (!photo) throw notFound("That picture doesn't exist.");
  return photo;
}

/** A picture a child sent to Santa, for parents who manage that child. */
export const GET = handle(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const photo = await findPhoto((await ctx.params).id);
  return new Response(new Uint8Array(photo.image), {
    headers: {
      "Content-Type": photo.mimeType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
});

export const DELETE = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const photo = await findPhoto((await ctx.params).id);
  await db.childPhoto.delete({ where: { id: photo.id } });
  return json({ ok: true });
});
