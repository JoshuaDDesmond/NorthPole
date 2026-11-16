import type { NextRequest } from "next/server";
import { requireOwner, requireParent } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, HttpError, json, parseJson } from "@/lib/http";
import { isKnownVoice } from "@/lib/santa/voices";
import { personalitySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const parent = await requireParent();
  const personality = await db.santaPersonality.upsert({
    where: { familyId: parent.familyId },
    create: { familyId: parent.familyId },
    update: {},
  });
  return json({ personality });
});

export const PATCH = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const parent = await requireOwner();
  const body = await parseJson(req, personalitySchema);
  if (body.voice && !isKnownVoice(body.voice)) throw new HttpError(400, "invalid_voice", "Please choose one of the listed voices.");
  const data = { ...body, customVoiceId: body.customVoiceId === undefined ? undefined : body.customVoiceId?.trim() || null };
  const personality = await db.santaPersonality.upsert({
    where: { familyId: parent.familyId },
    create: { familyId: parent.familyId, ...data },
    update: data,
  });
  return json({ personality });
});
