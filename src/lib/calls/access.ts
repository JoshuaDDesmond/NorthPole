import "server-only";
import { db } from "../db";
import { notFound } from "../http";

/** Loads a call only if it belongs to the given family. */
export async function getFamilyCall(callId: string, familyId: string) {
  const call = await db.call.findFirst({
    where: { id: callId, child: { familyId } },
    include: { child: { select: { id: true, familyId: true, callingEnabled: true, family: { select: { callingEnabled: true, timezone: true, generateMemoryProposals: true } } } } },
  });
  if (!call) throw notFound("That call doesn't exist.");
  return call;
}
