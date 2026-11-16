import "server-only";
import { db } from "../db";
import { hangupRealtimeCall } from "../openai/realtime";
import { startOfLocalDay, startOfLocalWeek } from "../time";
import type { CallStatus } from "@/generated/prisma/client";

const CONNECT_TIMEOUT_MS = 2 * 60_000;
const HEARTBEAT_TIMEOUT_MS = 90_000;
export const LIMIT_GRACE_SECONDS = 20;

export function elapsedSeconds(call: { connectedAt: Date | null; startedAt: Date }, now = new Date()) {
  const from = call.connectedAt ?? call.startedAt;
  return Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000));
}

/** Seconds of calling the child has used since local midnight (including any active call). */
export async function usedSecondsToday(childId: string, timezone: string, now = new Date()) {
  return usedSecondsSince(childId, startOfLocalDay(now, timezone), now);
}

/** Seconds of calling the child has used since Monday (local), including any active call. */
export async function usedSecondsThisWeek(childId: string, timezone: string, now = new Date()) {
  return usedSecondsSince(childId, startOfLocalWeek(now, timezone), now);
}

async function usedSecondsSince(childId: string, since: Date, now: Date) {
  const calls = await db.call.findMany({
    where: { childId, startedAt: { gte: since }, connectedAt: { not: null } },
    select: { status: true, durationSec: true, connectedAt: true, startedAt: true },
  });
  return calls.reduce((sum, c) => sum + (c.status === "ACTIVE" ? elapsedSeconds(c, now) : c.durationSec), 0);
}

export async function finishCall(
  callId: string,
  status: CallStatus,
  endReason: string,
  opts: { hangup?: boolean; durationSec?: number } = {},
) {
  const call = await db.call.findUnique({ where: { id: callId } });
  if (!call) return null;
  if (call.status !== "ACTIVE" && call.status !== "CONNECTING") return call;
  const now = new Date();
  const duration = call.connectedAt
    ? Math.min(opts.durationSec ?? elapsedSeconds(call, now), call.maxSeconds + LIMIT_GRACE_SECONDS)
    : 0;
  const updated = await db.call.update({
    where: { id: callId },
    data: {
      status: call.connectedAt ? status : status === "COMPLETED" ? "FAILED" : status,
      endReason,
      endedAt: now,
      durationSec: duration,
    },
  });
  // OpenAI calls can be hung up server-side. ElevenLabs calls are ended by the browser (told via
  // the heartbeat) and capped by the agent's own maximum duration.
  if (opts.hangup !== false && !call.model?.startsWith("elevenlabs")) await hangupRealtimeCall(call.openaiCallId);
  return updated;
}

/**
 * Enforces limits for calls whose browser may have vanished or misbehaved.
 * Runs lazily on call endpoints, on dashboard loads, and from the cron route.
 */
export async function sweepCalls(familyId?: string) {
  const now = Date.now();
  const open = await db.call.findMany({
    where: { status: { in: ["CONNECTING", "ACTIVE"] }, ...(familyId ? { child: { familyId } } : {}) },
    include: { child: { select: { family: { select: { callingEnabled: true } }, callingEnabled: true } } },
    take: 100,
  });
  for (const call of open) {
    if (call.status === "CONNECTING" && now - call.startedAt.getTime() > CONNECT_TIMEOUT_MS) {
      await finishCall(call.id, "FAILED", "connect_timeout");
      continue;
    }
    if (call.status !== "ACTIVE") continue;
    if (!call.child.family.callingEnabled || !call.child.callingEnabled) {
      await finishCall(call.id, "ENDED_BY_PARENT", "calling_disabled");
    } else if (elapsedSeconds(call, new Date(now)) > call.maxSeconds + LIMIT_GRACE_SECONDS) {
      await finishCall(call.id, "LIMIT_REACHED", "server_time_limit", { durationSec: call.maxSeconds });
    } else if (now - (call.lastHeartbeatAt ?? call.connectedAt ?? call.startedAt).getTime() > HEARTBEAT_TIMEOUT_MS) {
      const last = (call.lastHeartbeatAt ?? call.connectedAt ?? call.startedAt).getTime();
      const dur = call.connectedAt ? Math.round((last - call.connectedAt.getTime()) / 1000) : 0;
      await finishCall(call.id, "DISCONNECTED", "heartbeat_lost", { durationSec: dur });
    }
  }
}
