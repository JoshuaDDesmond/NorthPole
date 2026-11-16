import { after, type NextRequest } from "next/server";
import { requireFamilyDevice } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, json, parseJson } from "@/lib/http";
import { callEndSchema } from "@/lib/validation";
import { getFamilyCall } from "@/lib/calls/access";
import { elapsedSeconds, finishCall } from "@/lib/calls/lifecycle";
import { processCallDigest } from "@/lib/calls/digest";
import type { CallStatus } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const STATUS_FOR_REASON: Record<string, CallStatus> = {
  user_hangup: "COMPLETED",
  page_closed: "COMPLETED",
  time_limit: "LIMIT_REACHED",
  connection_lost: "DISCONNECTED",
  error: "DISCONNECTED",
  cancelled: "FAILED",
  server_stop: "ENDED_BY_PARENT",
};

/** Ends a call. Also accepts navigator.sendBeacon payloads when the page closes. */
export const POST = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const device = await requireFamilyDevice();
  const { id } = await ctx.params;
  const body = await parseJson(req, callEndSchema, 600_000);
  const call = await getFamilyCall(id, device);

  const wasOpen = call.status === "ACTIVE" || call.status === "CONNECTING";
  const serverElapsed = elapsedSeconds(call);
  const finished = wasOpen
    ? await finishCall(call.id, STATUS_FOR_REASON[body.reason] ?? "COMPLETED", body.reason, {
        durationSec: Math.min(body.durationSec ?? serverElapsed, serverElapsed),
      })
    : call;

  // One-time "next call" notes are used up once a real conversation happened.
  if (wasOpen && finished && finished.durationSec >= 45) {
    await db.child.update({ where: { id: call.childId }, data: { nextCallInstructions: "" } });
    await db.santaPersonality.updateMany({ where: { familyId: device.familyId }, data: { nextCallInstructions: "" } });
  }

  const transcript = body.transcript ?? [];
  if (wasOpen && call.child.family.generateMemoryProposals && transcript.length >= 2 && (finished?.durationSec ?? 0) >= 20) {
    after(async () => {
      try {
        await processCallDigest(call.id, transcript);
      } catch {
        console.error("[digest] post-call processing failed");
      }
    });
  }

  return json({ ok: true, durationSec: finished?.durationSec ?? 0, status: finished?.status ?? call.status });
});
