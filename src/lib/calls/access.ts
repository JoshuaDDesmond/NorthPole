import "server-only";
import { db } from "../db";
import { notFound } from "../http";

/** Loads a call only if it belongs to a child the paired device's parent manages. */
export async function getFamilyCall(callId: string, device: { familyId: string; parentUserId: string }) {
  const call = await db.call.findFirst({
    where: { id: callId, child: { familyId: device.familyId, access: { some: { parentUserId: device.parentUserId } } } },
    include: { child: { select: { id: true, familyId: true, callingEnabled: true, family: { select: { callingEnabled: true, timezone: true, generateMemoryProposals: true } } } } },
  });
  if (!call) throw notFound("That call doesn't exist.");
  return call;
}
