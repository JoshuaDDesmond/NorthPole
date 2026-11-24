import "server-only";

/**
 * Centralized, server-only access to configuration. Values are read lazily so
 * that missing optional credentials degrade into honest error states instead of
 * crashing the whole app at boot.
 */
export const env = {
  get openaiApiKey() {
    // Tolerate a key pasted with surrounding quotes or whitespace.
    return process.env.OPENAI_API_KEY?.trim().replace(/^["']|["']$/g, "").trim() || null;
  },
  /** Override only for testing against a mock server. */
  get openaiBaseUrl() {
    return (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
  },
  get realtimeModel() {
    return process.env.OPENAI_REALTIME_MODEL?.trim() || "gpt-realtime-2.1";
  },
  get transcriptionModel() {
    return process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "gpt-transcribe";
  },
  /** Model that describes pictures children send to Santa (must accept images). */
  get visionModel() {
    return process.env.OPENAI_VISION_MODEL?.trim() || this.summaryModel;
  },
  get summaryModel() {
    return process.env.OPENAI_SUMMARY_MODEL?.trim() || "gpt-6-luna";
  },
  get elevenLabsApiKey() {
    return process.env.ELEVENLABS_API_KEY?.trim().replace(/^["']|["']$/g, "").trim() || null;
  },
  /** Override only for testing against a mock server. */
  get elevenLabsBaseUrl() {
    return (process.env.ELEVENLABS_BASE_URL?.trim() || "https://api.elevenlabs.io").replace(/\/$/, "");
  },
  /** Optional: use an agent you created yourself instead of the one the app creates. */
  get elevenLabsAgentId() {
    return process.env.ELEVENLABS_AGENT_ID?.trim() || null;
  },
  /** Optional default voice when none is chosen in Personality. */
  get elevenLabsVoiceId() {
    return process.env.ELEVENLABS_VOICE_ID?.trim() || null;
  },
  /** ElevenLabs is used whenever its key is configured, unless VOICE_PROVIDER=openai. */
  get voiceProvider(): "elevenlabs" | "openai" {
    if (process.env.VOICE_PROVIDER?.trim() === "openai") return "openai";
    return this.elevenLabsApiKey ? "elevenlabs" : "openai";
  },
  get setupToken() {
    return process.env.SETUP_TOKEN?.trim() || null;
  },
  get cronSecret() {
    return process.env.CRON_SECRET?.trim() || null;
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
};
