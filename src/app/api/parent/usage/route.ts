import { requireOwner } from "@/lib/auth/session";
import { getSubscription } from "@/lib/elevenlabs";
import { env } from "@/lib/env";
import { handle, json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Owner-only: live plan usage from the voice provider. */
export const GET = handle(async () => {
  const owner = await requireOwner();
  await rateLimit(`usage:${owner.familyId}`, 60, 3600);
  if (env.voiceProvider !== "elevenlabs") return json({ provider: "openai" });
  return json({ provider: "elevenlabs", subscription: await getSubscription() });
});
