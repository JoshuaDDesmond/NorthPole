import "server-only";
import { db } from "../db";
import { digestCall, type TranscriptTurn } from "../santa/summarize";
import { safetyIdentifier } from "../openai/realtime";
import { selectMemories, selectTalkingPoints } from "../santa/prompt";

/**
 * Post-call processing. Runs after the response is sent. Produces a parent summary and new
 * memories: approved straight away when the family turned on automatic memories (never for a
 * call flagged for a check-in), otherwise proposed for review. The transcript lives only in
 * memory for the duration of this function.
 */
export async function processCallDigest(callId: string, transcript: TranscriptTurn[]) {
  const call = await db.call.findUnique({
    where: { id: callId },
    include: { child: { include: { family: { select: { autoApproveMemories: true } }, talkingPoints: true, memories: { where: { status: "APPROVED" } }, wishes: { select: { title: true, details: true } } } } },
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
    wishList: c.wishes.map((w) => (w.details ? `${w.title} (${w.details})` : w.title)),
    safetyId: safetyIdentifier(c.familyId, c.id),
  });
  if (!digest) return;

  const validPointIds = new Set(points.map((p) => p.id));
  const validMemoryIds = new Set(memories.map((m) => m.id));
  // New wishes heard on the call wait on the list for a parent to keep or remove.
  const existing = new Set(c.wishes.map((w) => normalizeWish(w.title)));
  const newWishes = digest.newWishes
    .map((w) => ({ title: w.title.trim(), details: w.details.trim() }))
    .filter((w) => w.title && !existing.has(normalizeWish(w.title)))
    .filter((w, i, all) => all.findIndex((x) => normalizeWish(x.title) === normalizeWish(w.title)) === i);

  const autoApprove = c.family.autoApproveMemories && !digest.safetyConcern;
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
      .map((content) => db.memory.create({ data: { childId: c.id, callId: call.id, content, status: autoApprove ? "APPROVED" : "PROPOSED", source: "CALL" } })),
    ...newWishes.map((w) =>
      db.wishListItem.create({ data: { childId: c.id, callId: call.id, title: w.title, details: w.details, source: "CALL", approved: false } }),
    ),
    ...(discussed.length
      ? [db.talkingPoint.updateMany({ where: { id: { in: discussed } }, data: { lastDiscussedAt: now, timesDiscussed: { increment: 1 } } })]
      : []),
    ...(referenced.length ? [db.memory.updateMany({ where: { id: { in: referenced } }, data: { lastReferencedAt: now } })] : []),
  ]);
}

function normalizeWish(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
