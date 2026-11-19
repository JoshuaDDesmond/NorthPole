import "server-only";
import { env } from "./env";
import { HttpError } from "./http";

/**
 * ElevenLabs Agents integration. The API key stays on the server; the browser
 * only ever receives a short-lived WebRTC conversation token for one call.
 */

function requireKey() {
  const key = env.elevenLabsApiKey;
  if (!key) throw new HttpError(503, "voice_not_configured", "Santa's phone line hasn't been connected yet. A parent needs to add the voice service key.");
  return key;
}

async function el(path: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const key = requireKey();
  try {
    return await fetch(`${env.elevenLabsBaseUrl}${path}`, {
      ...init,
      headers: { "xi-api-key": key, "Content-Type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
      cache: "no-store",
    });
  } catch {
    throw new HttpError(502, "voice_unreachable", "We couldn't reach the North Pole switchboard. Please try again in a moment.");
  }
}

async function errorDetail(res: Response) {
  try {
    const body = (await res.json()) as { detail?: unknown };
    const d = body.detail as unknown;
    const obj = d && typeof d === "object" && !Array.isArray(d) ? (d as { message?: string; status?: string }) : null;
    if (obj?.status === "missing_permissions" && obj.message) {
      const perm = obj.message.match(/permission (\w+)/)?.[1];
      return `the API key is missing the "${permissionLabel(perm)}" permission. In ElevenLabs, open Developers → API Keys, edit this key and turn that permission on, then try again (no redeploy needed)`;
    }
    const text = obj?.message ?? (typeof d === "string" ? d : Array.isArray(d) ? d.map((x) => (x as { msg?: string }).msg ?? "").join("; ") : JSON.stringify(d ?? ""));
    return text.replace(/sk_[A-Za-z0-9]+/g, "[key]").slice(0, 300);
  } catch {
    return "";
  }
}

/** Short-lived WebRTC token for one conversation with the agent. */
export async function getConversationToken(agentId: string, participantName: string) {
  const q = new URLSearchParams({ agent_id: agentId, participant_name: participantName.slice(0, 60) });
  const res = await el(`/v1/convai/conversation/token?${q}`);
  if (!res.ok) {
    console.error(`[elevenlabs] token request failed: ${res.status}`);
    if (res.status === 401 || res.status === 403) {
      throw new HttpError(503, "voice_auth_failed", "Santa's line isn't authorized right now. A parent should check the voice service key.");
    }
    if (res.status === 404) throw new HttpError(503, "voice_not_configured", "Santa's line needs to be reconnected. A parent should press Connect ElevenLabs in Settings.");
    if (res.status === 429) throw new HttpError(503, "voice_busy", "The North Pole lines are very busy right now. Please try again in a few minutes.");
    throw new HttpError(502, "voice_error", "The voice service had a problem connecting. Please try again.");
  }
  const body = (await res.json()) as { token?: string; conversation_id?: string };
  if (!body.token) throw new HttpError(502, "voice_error", "The voice service had a problem connecting. Please try again.");
  return { token: body.token, conversationId: body.conversation_id ?? null };
}

/** Bump when agentConfig changes; existing agents are updated automatically before the next call. */
export const AGENT_CONFIG_VERSION = 3;

/** Short listener sounds that should never make Santa stop mid-sentence. */
const BACKCHANNEL_TERMS = ["uh huh", "uh-huh", "mhm", "mm hmm", "mm-hmm", "hmm", "mm", "yeah", "yep", "yes", "okay", "ok", "oh", "ah", "wow", "cool", "nice", "haha", "ha", "right", "sure"];

/**
 * The agent's saved configuration. Each call overrides the prompt, greeting,
 * voice, model and speed for the child on the line, so these are only defaults.
 */
export function agentConfig(opts: { voiceId: string | null; llm: string; maxCallMinutes: number }) {
  return {
    name: "North Pole Direct Line · Santa",
    tags: ["north-pole-direct-line"],
    conversation_config: {
      agent: {
        first_message: "Well, hello there! You've reached the North Pole.",
        language: "en",
        prompt: {
          prompt: "You are Santa Claus on a warm, private phone call. Keep it kind, age-appropriate and never promise gifts.",
          llm: opts.llm,
          // Lets Santa hang up himself once goodbyes are said.
          built_in_tools: {
            end_call: {
              type: "system",
              name: "end_call",
              description:
                "End the phone call. Use it only for your very last line: after you have said goodbye AND the child has answered your goodbye, give one short acknowledgement and bye, then end the call. Never use it with your first goodbye, and never in the middle of the conversation.",
              params: { system_tool_type: "end_call" },
            },
          },
        },
        // Background noise can't cut off Santa's opening hello.
        disable_first_message_interruptions: true,
      },
      tts: {
        ...(opts.voiceId ? { voice_id: opts.voiceId } : {}),
        stability: 0.55,
        speed: 0.95,
      },
      turn: {
        // Answer promptly once the child finishes, without jumping in mid-sentence.
        turn_eagerness: "normal",
        turn_timeout: 8,
        // "Uh-huh", "yeah", "okay" and similar murmurs don't interrupt Santa.
        interruption_ignore_terms: BACKCHANNEL_TERMS,
        interruption_ignore_term_languages: ["en"],
        merge_with_default_ignore_terms: true,
      },
      conversation: {
        // Safety-net cap enforced by ElevenLabs; the app enforces the family's real limits.
        max_duration_seconds: Math.min(3600, Math.max(1800, opts.maxCallMinutes * 60 + 120)),
        client_events: ["conversation_initiation_metadata", "audio", "interruption", "user_transcript", "agent_response", "agent_response_correction", "ping"],
      },
    },
    platform_settings: {
      auth: { enable_auth: true },
      overrides: {
        conversation_config_override: {
          agent: { first_message: true, prompt: { prompt: true, llm: true } },
          tts: { voice_id: true, speed: true, stability: true },
        },
      },
    },
  };
}

/** Creates the agent, or updates it if it already exists. Returns the agent id. */
export async function upsertAgent(existingAgentId: string | null, opts: { voiceId: string | null; llm: string; maxCallMinutes: number }) {
  const config = agentConfig(opts);
  if (existingAgentId) {
    const res = await el(`/v1/convai/agents/${encodeURIComponent(existingAgentId)}`, { method: "PATCH", body: JSON.stringify(config) });
    if (res.ok) return existingAgentId;
    if (res.status !== 404) {
      throw new HttpError(502, "agent_update_failed", `ElevenLabs couldn't update Santa's agent${await detailSuffix(res)}`);
    }
  }
  const res = await el(`/v1/convai/agents/create`, { method: "POST", body: JSON.stringify(config) });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      const detail = await errorDetail(res);
      throw new HttpError(
        400,
        "voice_auth_failed",
        detail
          ? `ElevenLabs refused to create Santa's agent: ${detail}.`
          : "ElevenLabs refused to create Santa's agent. In ElevenLabs, edit the API key and set ElevenLabs Agents to Write, then try again (no redeploy needed).",
      );
    }
    throw new HttpError(502, "agent_create_failed", `ElevenLabs couldn't create Santa's agent${await detailSuffix(res)}`);
  }
  const body = (await res.json()) as { agent_id?: string };
  if (!body.agent_id) throw new HttpError(502, "agent_create_failed", "ElevenLabs didn't return an agent id.");
  return body.agent_id;
}

function permissionLabel(perm: string | undefined) {
  const labels: Record<string, string> = {
    voices_read: "Voices: Read",
    convai_read: "ElevenLabs Agents: Read",
    convai_write: "ElevenLabs Agents: Write",
  };
  return (perm && labels[perm]) || perm || "required";
}

async function detailSuffix(res: Response) {
  const d = await errorDetail(res);
  return d ? `: ${d}` : ` (status ${res.status}).`;
}

export type VoiceOption = { voiceId: string; name: string; description: string; previewUrl: string | null; category: string };

/** Voices available to the account (premade, cloned and saved library voices). */
export async function listVoices(search?: string): Promise<VoiceOption[]> {
  const q = new URLSearchParams({ page_size: "100", include_total_count: "false" });
  if (search?.trim()) q.set("search", search.trim().slice(0, 80));
  const res = await el(`/v2/voices?${q}`);
  if (!res.ok) throw new HttpError(502, "voices_failed", `Couldn't load voices from ElevenLabs${await detailSuffix(res)}`);
  const body = (await res.json()) as {
    voices?: { voice_id: string; name: string; description?: string | null; preview_url?: string | null; category?: string; labels?: Record<string, string> }[];
  };
  return (body.voices ?? []).map((v) => ({
    voiceId: v.voice_id,
    name: v.name,
    description: [v.labels?.age, v.labels?.gender, v.labels?.accent, v.description].filter(Boolean).join(" · ").slice(0, 160),
    previewUrl: v.preview_url ?? null,
    category: v.category ?? "",
  }));
}

/** Dashboard health check. Never returns the key. */
export async function checkElevenLabs(agentId: string | null): Promise<{ configured: boolean; ok: boolean; model: string; message: string }> {
  const model = "ElevenLabs";
  if (!env.elevenLabsApiKey) return { configured: false, ok: false, model, message: "ELEVENLABS_API_KEY is not set on the server." };
  const key = env.elevenLabsApiKey;
  if (key.startsWith("sk-ant-") || key.startsWith("sk-proj-")) {
    return { configured: true, ok: false, model, message: "ELEVENLABS_API_KEY holds a key from a different service. Paste your ElevenLabs API key (it starts with sk_)." };
  }
  if (!agentId) return { configured: true, ok: false, model, message: "Key found. Press Connect ElevenLabs below to set up Santa's agent." };
  const res = await el(`/v1/convai/agents/${encodeURIComponent(agentId)}`).catch(() => null);
  if (!res) return { configured: true, ok: false, model, message: "Couldn't reach ElevenLabs from the server." };
  if (res.ok) return { configured: true, ok: true, model, message: "Connected. Santa's ElevenLabs agent is ready." };
  if (res.status === 401 || res.status === 403) return { configured: true, ok: false, model, message: "ElevenLabs rejected the API key. Make sure it's active and allowed to use Agents." };
  if (res.status === 404) return { configured: true, ok: false, model, message: "Santa's agent wasn't found. Press Connect ElevenLabs to recreate it." };
  return { configured: true, ok: false, model, message: `ElevenLabs responded with status ${res.status}.` };
}

export type ElevenSubscription = {
  ok: true;
  tier: string;
  status: string;
  creditsUsed: number;
  creditsLimit: number;
  resetsAt: string | null;
  currency: string;
  overage: string | null;
  nextInvoice: string | null;
};

function money(cents: number | null | undefined, currency: string) {
  if (cents == null) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

/** Live plan usage for the owner's dashboard. Never throws; returns a readable reason instead. */
export async function getSubscription(): Promise<ElevenSubscription | { ok: false; message: string }> {
  if (!env.elevenLabsApiKey) return { ok: false, message: "ElevenLabs isn't connected." };
  let res: Response;
  try {
    res = await el("/v1/user/subscription", { timeoutMs: 8_000 });
  } catch {
    return { ok: false, message: "Couldn't reach ElevenLabs right now." };
  }
  if (!res.ok) {
    const detail = await errorDetail(res);
    return { ok: false, message: detail ? `ElevenLabs didn't share plan usage: ${detail}.` : `ElevenLabs didn't share plan usage (status ${res.status}).` };
  }
  const b = (await res.json()) as {
    tier?: string;
    status?: string;
    character_count?: number;
    character_limit?: number;
    next_character_count_reset_unix?: number | null;
    currency?: string | null;
    current_overage?: { amount?: string; currency?: string } | null;
    next_invoice?: { amount_due_cents?: number } | null;
  };
  const currency = (b.currency ?? b.current_overage?.currency ?? "usd").toLowerCase();
  const overageAmount = Number(b.current_overage?.amount ?? 0);
  return {
    ok: true,
    tier: b.tier ?? "unknown",
    status: b.status ?? "unknown",
    creditsUsed: b.character_count ?? 0,
    creditsLimit: b.character_limit ?? 0,
    resetsAt: b.next_character_count_reset_unix ? new Date(b.next_character_count_reset_unix * 1000).toISOString() : null,
    currency,
    overage: overageAmount > 0 ? new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(overageAmount) : null,
    nextInvoice: money(b.next_invoice?.amount_due_cents, currency),
  };
}
