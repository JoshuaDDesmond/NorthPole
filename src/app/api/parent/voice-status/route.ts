import { requireParent } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { checkElevenLabs } from "@/lib/elevenlabs";
import { env } from "@/lib/env";
import { handle, json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { checkVoiceService } from "@/lib/openai/realtime";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const parent = await requireParent();
  await rateLimit(`voice-status:${parent.familyId}`, 30, 3600);
  if (env.voiceProvider === "elevenlabs") {
    const family = await db.family.findUniqueOrThrow({ where: { id: parent.familyId }, select: { elevenAgentId: true } });
    return json({ provider: "elevenlabs", ...(await checkElevenLabs(family.elevenAgentId ?? env.elevenLabsAgentId)) });
  }
  return json({ provider: "openai", ...(await checkVoiceService()) });
});
