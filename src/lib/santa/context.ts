import "server-only";
import { db } from "../db";
import { buildSantaInstructions, selectMemories, selectTalkingPoints, type BuildInput } from "./prompt";
import { DEFAULT_VOICE, isKnownVoice } from "./voices";

/** Loads exactly one child's parent-approved data and builds Santa's instructions. */
export async function assembleCallContext(params: {
  familyId: string;
  childId: string;
  maxMinutes: number;
  now?: Date;
  resumeTranscript?: { role: "child" | "santa"; text: string }[];
}) {
  const now = params.now ?? new Date();
  const child = await db.child.findFirst({
    where: { id: params.childId, familyId: params.familyId },
    include: {
      family: { include: { personality: true } },
      talkingPoints: true,
      memories: { where: { status: "APPROVED" } },
      // Santa only ever sees the title and details of approved, mentionable wishes.
      wishes: {
        where: { approved: true, santaCanMention: true },
        select: { id: true, title: true, details: true, topWish: true, santaCanMention: true, approved: true },
        orderBy: [{ topWish: "desc" }, { sortOrder: "asc" }],
      },
    },
  });
  if (!child) return null;

  const [previousCallCount, lastCall] = await Promise.all([
    db.call.count({ where: { childId: child.id, connectedAt: { not: null } } }),
    db.call.findFirst({
      where: { childId: child.id, connectedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
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
    wishes: child.wishes,
    call: {
      now,
      timezone: child.family.timezone,
      maxMinutes: params.maxMinutes,
      previousCallCount,
      lastCallAt: lastCall?.startedAt ?? null,
      resumeTranscript: params.resumeTranscript,
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
    usedTalkingPoints: selectTalkingPoints(child.talkingPoints, now),
    usedMemories: selectMemories(child.memories),
  };
}
