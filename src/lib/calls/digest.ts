import "server-only";
import { db } from "../db";
import { digestCall, type TranscriptTurn } from "../santa/summarize";
import { safetyIdentifier } from "../openai/realtime";
import { selectMemories, selectTalkingPoints } from "../santa/prompt";

/**
 * Post-call processing. Runs after the response is sent. Produces a parent
 * summary and *proposed* memories (never auto-approved). The transcript lives
 * only in memory for the duration of this function.
 */
export async function processCallDigest(callId: string, transcript: TranscriptTurn[]) {
  const call = await db.call.findUnique({
    where: { id: callId },
    include: { child: { include: { talkingPoints: true, memories: { where: { status: "APPROVED" } } } } },
  });
  if (!call) return;
  const now = new Date();
  const points = selectTalkingPoints(call.child.talkingPoints, call.startedAt);
  const memories = selectMemories(call.child.memories);
  const c = call.child;
  const knownFacts = [c.sportsAndTeams, c.hobbies, c.favoriteActivities, c.accomplishments, c.challengesAndGoals, c.pets, c.siblings]
    .map((s) => s.trim())
    .filter(Boolean);

  const digest = await digestCall({
    transcript,
    knownFacts: [...knownFacts, ...memories.map((m) => m.content)],
    talkingPoints: points.map((p) => ({ id: p.id, topic: p.topic })),
    memories: memories.map((m) => ({ id: m.id, content: m.content })),
    safetyId: safetyIdentifier(c.familyId, c.id),
  });
  if (!digest) return;

  const validPointIds = new Set(points.map((p) => p.id));
  const validMemoryIds = new Set(memories.map((m) => m.id));
  const discussed = digest.discussedTalkingPointIds.filter((id) => validPointIds.has(id));
  const referenced = digest.referencedMemoryIds.filter((id) => validMemoryIds.has(id));

  await db.$transaction([
    db.call.update({
      where: { id: call.id },
      data: {
        summary: digest.summary.trim() || null,
        summaryStatus: digest.summary.trim() ? "PROPOSED" : "NONE",
        safetyFlag: digest.safetyConcern,
        safetyNote: digest.safetyConcern ? digest.safetyNote.trim() || "Santa's call included something worth checking in about." : null,
      },
    }),
    ...digest.proposedMemories
      .map((m) => m.trim())
      .filter(Boolean)
      .map((content) => db.memory.create({ data: { childId: c.id, callId: call.id, content, status: "PROPOSED", source: "CALL" } })),
    ...(discussed.length
      ? [db.talkingPoint.updateMany({ where: { id: { in: discussed } }, data: { lastDiscussedAt: now, timesDiscussed: { increment: 1 } } })]
      : []),
    ...(referenced.length ? [db.memory.updateMany({ where: { id: { in: referenced } }, data: { lastReferencedAt: now } })] : []),
  ]);
}
