import type { NextRequest } from "next/server";
import { requireFamilyDevice } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, HttpError, json, notFound } from "@/lib/http";
import { sniffImageType } from "@/lib/image";
import { safetyIdentifier } from "@/lib/openai/realtime";
import { deviceChildWhere } from "@/lib/parent-data";
import { rateLimit } from "@/lib/rate-limit";
import { reviewPhoto } from "@/lib/santa/photos";
import { photoNote } from "@/lib/santa/prompt";

export const dynamic = "force-dynamic";

/** The browser shrinks pictures before sending, so anything bigger than this isn't from our call screen. */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * A child sends Santa a picture from the call screen. The picture is checked and described so
 * Santa can talk about it: live if a call is on (the response carries the note for Santa), or on
 * the next call. Parents can see every picture; anything flagged is held back from Santa.
 */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const device = await requireFamilyDevice();
  const childId = req.nextUrl.searchParams.get("childId") ?? "";
  const callId = req.nextUrl.searchParams.get("callId");
  // What the child says it is, so there's no confusion ("my Five Nights at Freddy's poster").
  const caption = (req.nextUrl.searchParams.get("caption") ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  const child = await db.child.findFirst({ where: { id: childId, ...deviceChildWhere(device) }, select: { id: true, familyId: true, firstName: true, nickname: true } });
  if (!child) throw notFound("We couldn't find that caller.");
  await rateLimit(`photo:${child.id}`, 15, 24 * 3600);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new HttpError(413, "too_large", "That picture is too big to send. Try a different one.");
  const image = new Uint8Array(await req.arrayBuffer());
  if (!image.length || image.length > MAX_BYTES) throw new HttpError(413, "too_large", "That picture is too big to send. Try a different one.");
  const mimeType = sniffImageType(image);
  if (!mimeType) throw new HttpError(415, "unsupported", "That doesn't look like a picture Santa can open. Try a photo instead.");

  // Sent during a live call for this child? Then Santa reacts right away.
  const live = callId
    ? await db.call.findFirst({ where: { id: callId, childId: child.id, status: "ACTIVE" }, select: { id: true } })
    : null;

  const review = await reviewPhoto(image, mimeType, safetyIdentifier(child.familyId, child.id), caption);
  const flagged = review ? !review.safeForSanta : false;
  const description = review?.description.trim() ?? "";
  const photo = await db.childPhoto.create({
    data: {
      childId: child.id,
      callId: live?.id ?? null,
      image: Buffer.from(image),
      mimeType,
      caption,
      description,
      safetyFlag: flagged,
      safetyNote: flagged ? review?.concernNote.trim() || "This picture was held back for a parent to look at first." : null,
      mentionedAt: live && !flagged ? new Date() : null,
    },
    select: { id: true },
  });

  return json(
    {
      id: photo.id,
      // Only a cleared picture reaches Santa. The child just sees that it was sent.
      santaNote: live && !flagged ? photoNote(child.nickname || child.firstName, description, caption) : null,
    },
    { status: 201 },
  );
});
