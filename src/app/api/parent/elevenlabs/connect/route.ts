import type { NextRequest } from "next/server";
import { requireOwner } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { upsertAgent } from "@/lib/elevenlabs";
import { env } from "@/lib/env";
import { assertSameOrigin, handle, json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { DEFAULT_ELEVEN_LLM, isKnownElevenLlm } from "@/lib/santa/voices";

export const dynamic = "force-dynamic";

/** Owner-only: creates (or updates) Santa's ElevenLabs agent with the right settings. */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const owner = await requireOwner();
  await rateLimit(`eleven-connect:${owner.familyId}`, 10, 3600);
  const family = await db.family.findUniqueOrThrow({ where: { id: owner.familyId }, include: { personality: true } });
  const llm = family.personality?.elevenLlm && isKnownElevenLlm(family.personality.elevenLlm) ? family.personality.elevenLlm : DEFAULT_ELEVEN_LLM;
  const agentId = await upsertAgent(family.elevenAgentId ?? env.elevenLabsAgentId, {
    voiceId: family.personality?.elevenVoiceId ?? env.elevenLabsVoiceId,
    llm,
    maxCallMinutes: family.maxCallMinutes,
  });
  await db.family.update({ where: { id: family.id }, data: { elevenAgentId: agentId } });
  return json({ ok: true, agentId });
});
