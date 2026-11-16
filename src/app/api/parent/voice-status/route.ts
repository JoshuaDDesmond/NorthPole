import { requireParent } from "@/lib/auth/session";
import { handle, json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { checkVoiceService } from "@/lib/openai/realtime";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const parent = await requireParent();
  await rateLimit(`voice-status:${parent.familyId}`, 30, 3600);
  return json(await checkVoiceService());
});
