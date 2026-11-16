import type { NextRequest } from "next/server";
import { requireParent } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { handle, json, notFound } from "@/lib/http";
import { assembleCallContext } from "@/lib/santa/context";
import { getOwnedChild } from "@/lib/parent-data";

export const dynamic = "force-dynamic";

/**
 * Shows the parent exactly what Santa will be told on this child's next call.
 * Full transparency: nothing else about the family is sent to the voice service.
 */
export const GET = handle(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const parent = await requireParent();
  const { id } = await ctx.params;
  await getOwnedChild(id, parent);
  const family = await db.family.findUniqueOrThrow({ where: { id: parent.familyId }, select: { maxCallMinutes: true } });
  const result = await assembleCallContext({ familyId: parent.familyId, childId: id, maxMinutes: family.maxCallMinutes });
  if (!result) throw notFound("That child profile doesn't exist.");
  return json({
    instructions: result.instructions,
    voice: result.voice,
    talkingPointCount: result.usedTalkingPoints.length,
    memoryCount: result.usedMemories.length,
  });
});
