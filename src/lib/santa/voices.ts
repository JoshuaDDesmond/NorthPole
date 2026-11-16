/**
 * Built-in voices supported by the OpenAI Realtime API (audio.output.voice),
 * per the current API reference. Descriptions are our own listening notes.
 */
export const REALTIME_VOICES = [
  { id: "ash", label: "Ash", note: "Lowest and most grounded, a touch gravelly. Best for an older Santa." },
  { id: "ballad", label: "Ballad", note: "Mature storyteller warmth." },
  { id: "cedar", label: "Cedar", note: "Warm and natural, but younger sounding." },
  { id: "verse", label: "Verse", note: "Expressive with a friendly lilt." },
  { id: "echo", label: "Echo", note: "Even and calm." },
  { id: "marin", label: "Marin", note: "Clear and natural (lighter tone)." },
  { id: "alloy", label: "Alloy", note: "Neutral and balanced." },
  { id: "sage", label: "Sage", note: "Soft and thoughtful (lighter tone)." },
  { id: "coral", label: "Coral", note: "Bright and upbeat (lighter tone)." },
  { id: "shimmer", label: "Shimmer", note: "Airy and light." },
] as const;

export type RealtimeVoiceId = (typeof REALTIME_VOICES)[number]["id"];

export const DEFAULT_VOICE: RealtimeVoiceId = "ash";

export function isKnownVoice(v: string): v is RealtimeVoiceId {
  return REALTIME_VOICES.some((x) => x.id === v);
}

/** Conversation models offered for the ElevenLabs agent (all hosted by ElevenLabs, no extra keys). */
export const ELEVEN_LLMS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", note: "Fastest replies. Recommended for a natural phone feel." },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", note: "Quick and warm." },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", note: "Most thoughtful, slightly slower to answer." },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini", note: "Quick and reliable." },
  { id: "gpt-4.1", label: "GPT-4.1", note: "Thoughtful, slightly slower to answer." },
] as const;

export const DEFAULT_ELEVEN_LLM = "gemini-2.5-flash";

export function isKnownElevenLlm(v: string) {
  return ELEVEN_LLMS.some((x) => x.id === v);
}
