import type { NextRequest } from "next/server";
import { requireOwner } from "@/lib/auth/session";
import { listVoices } from "@/lib/elevenlabs";
import { handle, json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Owner-only: voices available on the family's ElevenLabs account, for the Personality picker. */
export const GET = handle(async (req: NextRequest) => {
  const owner = await requireOwner();
  await rateLimit(`eleven-voices:${owner.familyId}`, 60, 3600);
  const search = new URL(req.url).searchParams.get("search") ?? undefined;
  return json({ voices: await listVoices(search) });
});
