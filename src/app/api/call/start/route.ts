import type { NextRequest } from "next/server";
import { requireFamilyDevice } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { assertSameOrigin, handle, HttpError, json, notFound, parseJson } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { callStartSchema } from "@/lib/validation";
import { finishCall, sweepCalls, usedSecondsThisWeek, usedSecondsToday } from "@/lib/calls/lifecycle";
import { allowedCallSeconds } from "@/lib/time";
import { assembleCallContext } from "@/lib/santa/context";
import { createRealtimeCall, safetyIdentifier } from "@/lib/openai/realtime";
import { env } from "@/lib/env";
import { callPacing } from "@/lib/santa/prompt";
import { AGENT_CONFIG_VERSION, getConversationToken, upsertAgent } from "@/lib/elevenlabs";
import { DEFAULT_ELEVEN_LLM, isKnownElevenLlm } from "@/lib/santa/voices";

export const dynamic = "force-dynamic";

const MIN_CALL_SECONDS = 30;

export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const device = await requireFamilyDevice();
  await rateLimit(`call-start:${device.deviceId}`, 15, 3600);
  const body = await parseJson(req, callStartSchema, 300_000);

  await sweepCalls(device.familyId);

  const family = await db.family.findUnique({ where: { id: device.familyId } });
  if (!family) throw notFound();
  if (!family.callingEnabled) {
    throw new HttpError(503, "calling_disabled", "Santa's line is closed right now. Please check with a parent.");
  }
  const deviceParent = await db.parentUser.findUnique({ where: { id: device.parentUserId }, select: { consentAt: true } });
  if (!deviceParent?.consentAt) {
    throw new HttpError(403, "consent_required", "A parent needs to finish setting up Santa's line before the first call.");
  }

  const child = await db.child.findFirst({
    where: { id: body.childId, familyId: family.id, access: { some: { parentUserId: device.parentUserId } } },
  });
  if (!child) throw notFound("We couldn't find that caller.");
  if (!child.callingEnabled) {
    throw new HttpError(503, "child_disabled", "Santa's line is paused for you right now. Please check with a parent.");
  }

  // One call at a time per child: close anything left open (e.g. a crashed tab).
  const open = await db.call.findMany({ where: { childId: child.id, status: { in: ["CONNECTING", "ACTIVE"] } } });
  for (const c of open) await finishCall(c.id, c.status === "ACTIVE" ? "DISCONNECTED" : "FAILED", "superseded");

  // A reconnect after a dropped line continues the same conversation's time budget.
  let carriedOver = 0;
  let resumedFromId: string | null = null;
  if (body.resumeOfCallId) {
    let cursor = await db.call.findFirst({ where: { id: body.resumeOfCallId, childId: child.id } });
    if (cursor && cursor.endedAt && Date.now() - cursor.endedAt.getTime() < 10 * 60_000) {
      resumedFromId = cursor.id;
      for (let i = 0; cursor && i < 6; i++) {
        carriedOver += cursor.durationSec;
        cursor = cursor.resumedFromId ? await db.call.findUnique({ where: { id: cursor.resumedFromId } }) : null;
      }
    }
  }

  const [used, usedWeek] = await Promise.all([usedSecondsToday(child.id, family.timezone), usedSecondsThisWeek(child.id, family.timezone)]);
  const allowed = allowedCallSeconds({
    maxCallMinutes: family.maxCallMinutes,
    dailyMinutes: family.dailyMinutesPerChild,
    usedTodaySeconds: used,
    weeklyMinutes: family.weeklyMinutesPerChild,
    usedThisWeekSeconds: usedWeek,
    carriedOverSeconds: carriedOver,
  });
  if (allowed < MIN_CALL_SECONDS) {
    const weekOut = family.weeklyMinutesPerChild * 60 - usedWeek < MIN_CALL_SECONDS;
    const dayOut = family.dailyMinutesPerChild * 60 - used < MIN_CALL_SECONDS;
    if (weekOut) {
      throw new HttpError(429, "weekly_limit", "That's all your North Pole calling time for this week. Santa would love to hear from you next week!");
    }
    if (dayOut || carriedOver === 0) {
      throw new HttpError(429, "daily_limit", "That's all the North Pole calling time for today. Santa would love to hear from you tomorrow!");
    }
    throw new HttpError(429, "call_limit", "That was the end of this call's time. You can call Santa again a little later.");
  }

  const provider = env.voiceProvider;
  if (provider === "openai" && !body.sdp) throw new HttpError(400, "bad_request", "Missing call setup.");
  let agentId = provider === "elevenlabs" ? (family.elevenAgentId ?? env.elevenLabsAgentId) : null;
  if (provider === "elevenlabs" && (!agentId || family.elevenAgentVersion < AGENT_CONFIG_VERSION)) {
    // Set up Santa's agent on the first call, or push updated agent settings after an app update.
    try {
      const personality = await db.santaPersonality.findUnique({ where: { familyId: family.id } });
      agentId = await upsertAgent(agentId, {
        voiceId: personality?.elevenVoiceId ?? env.elevenLabsVoiceId,
        llm: personality?.elevenLlm && isKnownElevenLlm(personality.elevenLlm) ? personality.elevenLlm : DEFAULT_ELEVEN_LLM,
        maxCallMinutes: family.maxCallMinutes,
      });
      await db.family.update({ where: { id: family.id }, data: { elevenAgentId: agentId, elevenAgentVersion: AGENT_CONFIG_VERSION } });
    } catch (err) {
      if (family.elevenAgentId) {
        // An existing agent still works with its old settings; don't block the call over a refresh.
        console.error("[elevenlabs] agent settings refresh failed:", err instanceof HttpError ? err.message : "unknown");
      } else {
        console.error("[elevenlabs] automatic agent setup failed:", err instanceof HttpError ? err.message : "unknown");
        throw new HttpError(503, "voice_not_configured", "Santa's phone line isn't ready yet. A parent can check Settings → Voice service for details.");
      }
    }
  }

  const ctx = await assembleCallContext({
    familyId: family.id,
    childId: child.id,
    maxMinutes: Math.max(1, Math.round(allowed / 60)),
    resumeTranscript: resumedFromId ? body.resumeTranscript : undefined,
    engine: provider === "elevenlabs" ? "text" : "speech",
  });
  if (!ctx) throw notFound();

  const call = await db.call.create({
    data: {
      childId: child.id,
      deviceId: device.deviceId,
      resumedFromId,
      maxSeconds: allowed,
      voice: provider === "elevenlabs" ? (ctx.eleven.voiceId ?? "agent-default") : typeof ctx.voice === "string" ? ctx.voice : "custom",
    },
  });

  if (provider === "elevenlabs") {
    try {
      const { token, conversationId } = await getConversationToken(agentId!, ctx.child.nickname || ctx.child.firstName);
      await db.call.update({ where: { id: call.id }, data: { openaiCallId: conversationId, model: `elevenlabs:${ctx.eleven.llm}` } });
      // ElevenLabs applies per-call settings sent from the browser, so the briefing goes to the
      // device for this one call. It contains only what Santa may know about this child.
      return json({
        provider,
        callId: call.id,
        conversationToken: token,
        overrides: {
          agent: { prompt: { prompt: ctx.instructions, llm: ctx.eleven.llm }, firstMessage: ctx.eleven.firstMessage },
          tts: { ...(ctx.eleven.voiceId ? { voiceId: ctx.eleven.voiceId } : {}), speed: ctx.eleven.speed },
        },
        maxSeconds: allowed,
        pacing: callPacing(ctx.conversationLength, allowed),
        collectTranscript: family.generateMemoryProposals,
        ambientSound: family.ambientSound,
      });
    } catch (err) {
      await db.call.update({
        where: { id: call.id },
        data: { status: "FAILED", endReason: err instanceof HttpError ? err.code : "voice_error", endedAt: new Date() },
      });
      throw err;
    }
  }

  try {
    const { answerSdp, callId } = await createRealtimeCall(
      body.sdp!,
      { instructions: ctx.instructions, voice: ctx.voice, speed: ctx.speed, transcribeChild: family.generateMemoryProposals },
      safetyIdentifier(family.id, child.id),
    );
    await db.call.update({ where: { id: call.id }, data: { openaiCallId: callId, model: env.realtimeModel } });
    return json({
      provider,
      callId: call.id,
      answerSdp,
      maxSeconds: allowed,
      pacing: callPacing(ctx.conversationLength, allowed),
      collectTranscript: family.generateMemoryProposals,
      ambientSound: family.ambientSound,
    });
  } catch (err) {
    await db.call.update({
      where: { id: call.id },
      data: { status: "FAILED", endReason: err instanceof HttpError ? err.code : "voice_error", endedAt: new Date() },
    });
    throw err;
  }
});
