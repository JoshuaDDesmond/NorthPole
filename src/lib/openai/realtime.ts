import "server-only";
import { createHash } from "node:crypto";
import { env } from "../env";
import { HttpError } from "../http";


export type RealtimeSessionConfig = {
  instructions: string;
  voice: string | { id: string };
  transcribeChild: boolean;
};

/** Stable, non-reversible identifier so OpenAI can apply per-end-user safety controls. */
export function safetyIdentifier(familyId: string, childId: string) {
  return createHash("sha256").update(`northpole:${familyId}:${childId}`).digest("hex").slice(0, 32);
}

export function buildSessionPayload(cfg: RealtimeSessionConfig) {
  return {
    type: "realtime",
    model: env.realtimeModel,
    instructions: cfg.instructions,
    max_output_tokens: 1500,
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        transcription: cfg.transcribeChild ? { model: env.transcriptionModel, language: "en" } : null,
        turn_detection: {
          type: "semantic_vad",
          eagerness: "auto",
          create_response: true,
          interrupt_response: true,
        },
      },
      output: { voice: cfg.voice },
    },
  };
}

function requireKey() {
  const key = env.openaiApiKey;
  if (!key) {
    throw new HttpError(503, "voice_not_configured", "Santa's phone line hasn't been connected yet. A parent needs to add the voice service key.");
  }
  return key;
}

/**
 * Creates a WebRTC Realtime call using the unified interface: the browser's SDP
 * offer is relayed by our server together with the session configuration, so
 * no API key or client secret ever reaches the browser. Returns the SDP answer
 * and the call id (used for server-side hang-up / time-limit enforcement).
 */
export async function createRealtimeCall(sdpOffer: string, cfg: RealtimeSessionConfig, safetyId: string) {
  const key = requireKey();
  const form = new FormData();
  form.set("sdp", sdpOffer);
  form.set("session", JSON.stringify(buildSessionPayload(cfg)));

  let res: Response;
  try {
    res = await fetch(`${env.openaiBaseUrl}/realtime/calls`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "OpenAI-Safety-Identifier": safetyId },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new HttpError(502, "voice_unreachable", "We couldn't reach the North Pole switchboard. Please try again in a moment.");
  }

  if (!res.ok) {
    const detail = await safeErrorDetail(res);
    console.error(`[realtime] call create failed: ${res.status} ${detail}`);
    if (res.status === 401 || res.status === 403) {
      throw new HttpError(503, "voice_auth_failed", "Santa's line isn't authorized right now. A parent should check the voice service key.");
    }
    if (res.status === 429) {
      throw new HttpError(503, "voice_busy", "The North Pole lines are very busy right now. Please try again in a few minutes.");
    }
    if (res.status === 400) {
      throw new HttpError(502, "voice_rejected", "The voice service rejected the call setup. A parent should check the voice settings.");
    }
    throw new HttpError(502, "voice_error", "The voice service had a problem connecting. Please try again.");
  }

  const answerSdp = await res.text();
  const location = res.headers.get("location") ?? "";
  const callId = location.split("/").filter(Boolean).pop() ?? null;
  return { answerSdp, callId };
}

export async function hangupRealtimeCall(callId: string | null | undefined) {
  const key = env.openaiApiKey;
  if (!key || !callId) return false;
  try {
    const res = await fetch(`${env.openaiBaseUrl}/realtime/calls/${encodeURIComponent(callId)}/hangup`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Lightweight check used by the parent dashboard. Never returns the key. */
export async function checkVoiceService(): Promise<{ configured: boolean; ok: boolean; model: string; message: string }> {
  const model = env.realtimeModel;
  const key = env.openaiApiKey;
  if (!key) return { configured: false, ok: false, model, message: "OPENAI_API_KEY is not set on the server." };
  try {
    const res = await fetch(`${env.openaiBaseUrl}/models/${encodeURIComponent(model)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (res.ok) return { configured: true, ok: true, model, message: "Connected. The realtime voice model is available to your account." };
    if (res.status === 401) return { configured: true, ok: false, model, message: "The API key was rejected. Check that it is correct and active." };
    if (res.status === 404) return { configured: true, ok: false, model, message: `Your account can't access the model "${model}". Set OPENAI_REALTIME_MODEL to a realtime model you have access to.` };
    return { configured: true, ok: false, model, message: `The voice service responded with status ${res.status}.` };
  } catch {
    return { configured: true, ok: false, model, message: "Couldn't reach the voice service from the server." };
  }
}

async function safeErrorDetail(res: Response) {
  try {
    const body = (await res.json()) as { error?: { code?: string; type?: string } };
    return [body.error?.type, body.error?.code].filter(Boolean).join("/");
  } catch {
    return "";
  }
}
