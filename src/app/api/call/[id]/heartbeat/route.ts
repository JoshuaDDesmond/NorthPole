import type { NextRequest } from "next/server";
import { requireFamilyDevice } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, json } from "@/lib/http";
import { getFamilyCall } from "@/lib/calls/access";
import { elapsedSeconds, finishCall, LIMIT_GRACE_SECONDS } from "@/lib/calls/lifecycle";

export const dynamic = "force-dynamic";

/**
 * Periodic check-in from an active call. The server is the source of truth for
 * the time limit and the parent's emergency off switch: when either applies it
 * hangs up the Realtime call itself and tells the browser to stop.
 */
export const POST = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const device = await requireFamilyDevice();
  const { id } = await ctx.params;
  const call = await getFamilyCall(id, device);

  if (call.status !== "ACTIVE") {
    return json({ stop: true, reason: call.endReason ?? "ended", remainingSeconds: 0 });
  }
  if (!call.child.family.callingEnabled || !call.child.callingEnabled) {
    await finishCall(call.id, "ENDED_BY_PARENT", "calling_disabled");
    return json({ stop: true, reason: "calling_disabled", remainingSeconds: 0 });
  }
  const elapsed = elapsedSeconds(call);
  if (elapsed > call.maxSeconds + LIMIT_GRACE_SECONDS) {
    await finishCall(call.id, "LIMIT_REACHED", "server_time_limit", { durationSec: call.maxSeconds });
    return json({ stop: true, reason: "time_limit", remainingSeconds: 0 });
  }
  await db.call.update({ where: { id: call.id }, data: { lastHeartbeatAt: new Date() } });
  return json({ stop: false, remainingSeconds: Math.max(0, call.maxSeconds - elapsed) });
});
