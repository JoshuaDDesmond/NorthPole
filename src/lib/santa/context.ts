import "server-only";
import { db } from "../db";
import { buildSantaInstructions, santaGreeting, selectMemories, selectTalkingPoints, type BuildInput } from "./prompt";
import { env } from "../env";
import { DEFAULT_ELEVEN_LLM, DEFAULT_VOICE, isKnownElevenLlm, isKnownVoice } from "./voices";

/** Loads exactly one child's parent-approved data and builds Santa's instructions. */
export async function assembleCallContext(params: {
  familyId: string;
  childId: string;
  maxMinutes: number;
  now?: Date;
  resumeTranscript?: { role: "child" | "santa"; text: string }[];
  /** "text" when ElevenLabs voices Santa from a text model's replies. */
  engine?: "speech" | "text";
}) {
  const now = params.now ?? new Date();
  const child = await db.child.findFirst({
    where: { id: params.childId, familyId: params.familyId },
    include: {
      family: { include: { personality: true } },
      talkingPoints: true,
      memories: { where: { status: "APPROVED" } },
      // Household notes from the parents who manage this child (the same parents whose device code shows them).
      access: { select: { parentUser: { select: { householdNotes: true } } } },
      // Santa only ever sees the title and details of approved, mentionable wishes.
      wishes: {
        where: { approved: true, santaCanMention: true },
        select: { id: true, title: true, details: true, topWish: true, santaCanMention: true, approved: true },
        orderBy: [{ topWish: "desc" }, { sortOrder: "asc" }],
      },
    },
  });
  if (!child) return null;

  const [previousCallCount, realCallCount, lastCall, recentCalls] = await Promise.all([
    db.call.count({ where: { childId: child.id, connectedAt: { not: null } } }),
    // A call of a minute or more counts as the one where Santa asked "have you been good?".
    db.call.count({ where: { childId: child.id, connectedAt: { not: null }, durationSec: { gte: 60 } } }),
    db.call.findFirst({
      where: { childId: child.id, connectedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
    // Recaps of recent calls (never ones flagged for a parent check-in), if the family allows it.
    child.family.autoRecallCalls
      ? db.call.findMany({
          where: { childId: child.id, connectedAt: { not: null }, summary: { not: null }, safetyFlag: false },
          orderBy: { startedAt: "desc" },
          take: 10,
          select: { startedAt: true, summary: true },
        })
      : Promise.resolve([] as { startedAt: Date; summary: string | null }[]),
  ]);

  const personality = child.family.personality;
  const customFields = Array.isArray(child.customFields)
    ? (child.customFields as unknown[])
        .filter((f): f is { label: string; value: string } => typeof f === "object" && f !== null && "label" in f && "value" in f)
        .map((f) => ({ label: String(f.label), value: String(f.value) }))
    : [];

  const input: BuildInput = {
    personality: {
      humor: personality?.humor ?? 3,
      energy: personality?.energy ?? 3,
      northPoleReferences: personality?.northPoleReferences ?? 3,
      conversationLength: personality?.conversationLength ?? "MEDIUM",
      topicsToAvoid: personality?.topicsToAvoid ?? "",
      nextCallInstructions: personality?.nextCallInstructions ?? "",
    },
    child: { ...child, customFields },
    talkingPoints: child.talkingPoints,
    memories: child.memories,
    householdNotes: child.access.map((a) => a.parentUser.householdNotes).filter((n) => n.trim()),
    wishes: child.wishes,
    call: {
      now,
      timezone: child.family.timezone,
      maxMinutes: params.maxMinutes,
      previousCallCount,
      askedIfGoodBefore: realCallCount > 0,
      lastCallAt: lastCall?.startedAt ?? null,
      resumeTranscript: params.resumeTranscript,
      recentCalls: recentCalls.map((c) => ({ at: c.startedAt, summary: c.summary ?? "" })),
      engine: params.engine ?? "speech",
    },
  };

  const voiceSetting = personality?.customVoiceId?.trim()
    ? { id: personality.customVoiceId.trim() }
    : personality?.voice && isKnownVoice(personality.voice)
      ? personality.voice
      : DEFAULT_VOICE;

  return {
    child,
    instructions: buildSantaInstructions(input),
    voice: voiceSetting,
    speed: personality?.speakingPace ?? 0.9,
    conversationLength: personality?.conversationLength ?? "MEDIUM",
    eleven: {
      voiceId: personality?.elevenVoiceId?.trim() || env.elevenLabsVoiceId,
      llm: personality?.elevenLlm && isKnownElevenLlm(personality.elevenLlm) ? personality.elevenLlm : DEFAULT_ELEVEN_LLM,
      // ElevenLabs speed range is narrower; keep Santa a touch unhurried.
      speed: Math.min(1.1, Math.max(0.8, (personality?.speakingPace ?? 0.9) + 0.05)),
      firstMessage: santaGreeting({
        name: child.nickname || child.firstName,
        previousCallCount,
        resuming: Boolean(params.resumeTranscript?.length),
      }),
    },
    usedTalkingPoints: selectTalkingPoints(child.talkingPoints, now),
    usedMemories: selectMemories(child.memories),
  };
}
