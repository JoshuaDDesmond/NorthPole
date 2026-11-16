import type { NextRequest } from "next/server";
import { requireOwner, requireParent } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, HttpError, json, parseJson } from "@/lib/http";
import { sweepCalls } from "@/lib/calls/lifecycle";
import { isValidTimezone } from "@/lib/time";
import { familySettingsSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const PUBLIC_FIELDS = {
  id: true,
  name: true,
  timezone: true,
  callingEnabled: true,
  maxCallMinutes: true,
  dailyMinutesPerChild: true,
  generateMemoryProposals: true,
  ambientSound: true,
  santaPhotoUpdatedAt: true,
} as const;

export const GET = handle(async () => {
  const parent = await requireParent();
  const family = await db.family.findUniqueOrThrow({ where: { id: parent.familyId }, select: PUBLIC_FIELDS });
  return json({ family });
});

export const PATCH = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const parent = await requireOwner();
  const body = await parseJson(req, familySettingsSchema);
  if (body.timezone && !isValidTimezone(body.timezone)) throw new HttpError(400, "invalid_timezone", "Please choose a valid time zone.");
  const family = await db.family.update({ where: { id: parent.familyId }, data: body, select: PUBLIC_FIELDS });
  // The emergency switch takes effect immediately: hang up any live call now.
  if (body.callingEnabled === false) await sweepCalls(parent.familyId);
  return json({ family });
});
