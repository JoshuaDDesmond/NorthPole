import "server-only";
import { z } from "zod";
import { env } from "../env";

export type TranscriptTurn = { role: "child" | "santa"; text: string };

export const summarySchema = z.object({
  summary: z.string().max(600),
  proposedMemories: z.array(z.string().max(240)).max(5),
  discussedTalkingPointIds: z.array(z.string()).max(20),
  referencedMemoryIds: z.array(z.string()).max(20),
  safetyConcern: z.boolean(),
  safetyNote: z.string().max(400),
});

export type CallDigest = z.infer<typeof summarySchema>;

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "proposedMemories", "discussedTalkingPointIds", "referencedMemoryIds", "safetyConcern", "safetyNote"],
  properties: {
    summary: { type: "string", description: "2-3 sentence summary for the parent, written plainly." },
    proposedMemories: {
      type: "array",
      maxItems: 5,
      items: { type: "string" },
      description: "Concise, useful facts the child shared that Santa could naturally follow up on next time.",
    },
    discussedTalkingPointIds: { type: "array", items: { type: "string" } },
    referencedMemoryIds: { type: "array", items: { type: "string" } },
    safetyConcern: { type: "boolean" },
    safetyNote: { type: "string", description: "Empty unless safetyConcern is true." },
  },
} as const;

const DIGEST_INSTRUCTIONS = `You help a parent review a phone call their child had with an AI Santa Claus.
From the transcript, produce:
1. summary: 2-3 plain sentences for the parent about what was discussed. No fluff.
2. proposedMemories: up to 5 short facts the CHILD shared that would help Santa follow up naturally on a future call (e.g. "Has a big hockey game on Saturday and is nervous about it"). Rules: only things the child actually said; one fact per item; under 25 words; third person, no names needed; no sensitive data (addresses, phone numbers, passwords, full school names, health details, anything private about other people); skip anything already covered by the known facts list; return [] if nothing is worth remembering.
3. discussedTalkingPointIds: ids of the listed talking points that were actually discussed.
4. referencedMemoryIds: ids of the listed memories Santa actually referenced.
5. safetyConcern: true ONLY if the child said something a parent should know about for their safety or wellbeing (harm, abuse, danger, serious distress, bullying). safetyNote: one neutral sentence if true, else "".`;

/**
 * Turns a transient transcript into a parent-review digest. The transcript is
 * used only for this request and is never stored (store: false).
 */
export async function digestCall(params: {
  transcript: TranscriptTurn[];
  knownFacts: string[];
  talkingPoints: { id: string; topic: string }[];
  memories: { id: string; content: string }[];
  safetyId: string;
}): Promise<CallDigest | null> {
  const key = env.openaiApiKey;
  if (!key) return null;
  const transcript = params.transcript
    .filter((t) => t.text.trim())
    .map((t) => `${t.role === "child" ? "Child" : "Santa"}: ${t.text.trim()}`)
    .join("\n")
    .slice(-24_000);
  if (transcript.length < 20) return null;

  const input = [
    `Known facts:\n${params.knownFacts.map((f) => `- ${f}`).join("\n") || "- (none)"}`,
    `Talking points:\n${params.talkingPoints.map((t) => `- ${t.id}: ${t.topic}`).join("\n") || "- (none)"}`,
    `Memories:\n${params.memories.map((m) => `- ${m.id}: ${m.content}`).join("\n") || "- (none)"}`,
    `Transcript:\n${transcript}`,
  ].join("\n\n");

  try {
    const res = await fetch(`${env.openaiBaseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": params.safetyId,
      },
      body: JSON.stringify({
        model: env.summaryModel,
        instructions: DIGEST_INSTRUCTIONS,
        input,
        store: false,
        text: { format: { type: "json_schema", name: "call_digest", strict: true, schema: jsonSchema } },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      console.error(`[digest] failed with status ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { output?: { type: string; content?: { type: string; text?: string }[] }[] };
    const text = body.output
      ?.flatMap((o) => o.content ?? [])
      .find((c) => c.type === "output_text" && c.text)?.text;
    if (!text) return null;
    return summarySchema.parse(JSON.parse(text));
  } catch {
    console.error("[digest] could not produce a call digest");
    return null;
  }
}
