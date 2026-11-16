import "server-only";

/**
 * Centralized, server-only access to configuration. Values are read lazily so
 * that missing optional credentials degrade into honest error states instead of
 * crashing the whole app at boot.
 */
export const env = {
  get openaiApiKey() {
    return process.env.OPENAI_API_KEY?.trim() || null;
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
  get summaryModel() {
    return process.env.OPENAI_SUMMARY_MODEL?.trim() || "gpt-6-luna";
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
