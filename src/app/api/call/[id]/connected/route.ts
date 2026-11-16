import type { NextRequest } from "next/server";
import { requireFamilyDevice } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, HttpError, json } from "@/lib/http";
import { getFamilyCall } from "@/lib/calls/access";

export const dynamic = "force-dynamic";

/** Called by the browser only after the WebRTC peer connection and data channel are open. */
export const POST = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const device = await requireFamilyDevice();
  const { id } = await ctx.params;
  const call = await getFamilyCall(id, device.familyId);
  if (call.status !== "CONNECTING") {
    throw new HttpError(409, "call_not_connecting", "This call is no longer connecting.");
  }
  const now = new Date();
  await db.call.update({ where: { id: call.id }, data: { status: "ACTIVE", connectedAt: now, lastHeartbeatAt: now } });
  return json({ ok: true, maxSeconds: call.maxSeconds });
});
