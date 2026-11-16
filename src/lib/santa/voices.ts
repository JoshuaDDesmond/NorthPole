/**
 * Built-in voices supported by the OpenAI Realtime API (audio.output.voice),
 * per the current API reference. Descriptions are our own listening notes.
 */
export const REALTIME_VOICES = [
  { id: "cedar", label: "Cedar", note: "Deep, warm and unhurried. Recommended for Santa." },
  { id: "ash", label: "Ash", note: "Lower and grounded, a touch gravelly." },
  { id: "ballad", label: "Ballad", note: "Gentle storyteller warmth." },
  { id: "verse", label: "Verse", note: "Expressive with a friendly lilt." },
  { id: "echo", label: "Echo", note: "Even and calm." },
  { id: "marin", label: "Marin", note: "Clear and natural (lighter tone)." },
  { id: "alloy", label: "Alloy", note: "Neutral and balanced." },
  { id: "sage", label: "Sage", note: "Soft and thoughtful (lighter tone)." },
  { id: "coral", label: "Coral", note: "Bright and upbeat (lighter tone)." },
  { id: "shimmer", label: "Shimmer", note: "Airy and light." },
] as const;

export type RealtimeVoiceId = (typeof REALTIME_VOICES)[number]["id"];

export const DEFAULT_VOICE: RealtimeVoiceId = "cedar";

export function isKnownVoice(v: string): v is RealtimeVoiceId {
  return REALTIME_VOICES.some((x) => x.id === v);
}
