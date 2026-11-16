"use client";

import type { VoiceConversation } from "@elevenlabs/client";
import { wrapUpNudge } from "../santa/prompt";
import { CallError, friendlyError, type CallErrorCode, type CallPhase, type EndReason, type TranscriptTurn, type VoiceSessionEvents } from "./voice-session";

/**
 * ElevenLabsSession
 * -----------------
 * Same surface as VoiceSessionManager, backed by an ElevenLabs Agents
 * conversation over WebRTC. Our server authorizes the call, checks limits and
 * builds Santa's briefing for this child; ElevenLabs runs speech recognition,
 * turn-taking, interruptions, the conversation model and Santa's voice.
 */

const HEARTBEAT_MS = 20_000;
const WRAP_UP_LEAD_SECONDS = 45;
const CHILD_SPEAKING_THRESHOLD = 0.12;

type StartResponse = {
  provider?: string;
  callId?: string;
  conversationToken?: string;
  overrides?: Record<string, unknown>;
  maxSeconds?: number;
  collectTranscript?: boolean;
  error?: { code: string; message: string };
};

export class ElevenLabsSession {
  private conversation: VoiceConversation | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private intervals: ReturnType<typeof setInterval>[] = [];
  private pageHideHandler: (() => void) | null = null;
  private micProbe: MediaStream | null = null;

  private _phase: CallPhase = "idle";
  private callId: string | null = null;
  private connectedAt = 0;
  private maxSeconds = 0;
  private collectTranscript = false;
  private transcript: TranscriptTurn[] = [];
  private ended = false;
  private wrapUpSent = false;
  private childSpeaking = false;
  private mode: "speaking" | "listening" = "listening";
  private volume = 1;

  constructor(
    private readonly childId: string,
    private readonly events: VoiceSessionEvents = {},
  ) {}

  get phase() {
    return this._phase;
  }
  get currentCallId() {
    return this.callId;
  }
  get transcriptSoFar(): TranscriptTurn[] {
    return [...this.transcript];
  }
  get elapsedSeconds() {
    return this.connectedAt ? Math.floor((Date.now() - this.connectedAt) / 1000) : 0;
  }

  private setPhase(p: CallPhase) {
    this._phase = p;
    this.events.onPhase?.(p);
  }

  /** Must be called from the Call button tap so the browser allows the microphone and audio. */
  async start(opts: { audioContext?: AudioContext; resumeOfCallId?: string; resumeTranscript?: TranscriptTurn[] }) {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) throw this.fail("unsupported");
    this.setPhase(opts.resumeOfCallId ? "reconnecting" : "requesting_mic");

    // 1. Ask for the microphone first so permission problems get a clear message.
    try {
      this.micProbe = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      throw this.fail(name === "NotAllowedError" || name === "SecurityError" ? "mic_denied" : name === "NotFoundError" ? "mic_missing" : "mic_error");
    }
    this.micProbe.getTracks().forEach((t) => t.stop());
    this.micProbe = null;
    if (this.ended) return;
    if (!opts.resumeOfCallId) this.setPhase("connecting");

    // 2. Our server authorizes the call and returns a one-time token plus this child's briefing.
    let data: StartResponse;
    try {
      const res = await fetch("/api/call/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId: this.childId, resumeOfCallId: opts.resumeOfCallId, resumeTranscript: opts.resumeTranscript?.slice(-12) }),
      });
      data = (await res.json().catch(() => ({}))) as StartResponse;
      if (!res.ok || !data.callId || !data.conversationToken) throw this.fail(data.error?.code ?? "connect_failed", data.error?.message);
    } catch (e) {
      if (e instanceof CallError) throw e;
      throw this.fail("connect_failed");
    }
    this.callId = data.callId!;
    this.maxSeconds = data.maxSeconds ?? 600;
    this.collectTranscript = Boolean(data.collectTranscript);
    if (opts.resumeTranscript) this.transcript = [...opts.resumeTranscript];
    this.installPageHide();
    if (this.ended) {
      await this.notifyEnd("cancelled", 0);
      return;
    }

    // 3. Connect to the ElevenLabs agent. The SDK is loaded only when a call starts.
    try {
      const { Conversation } = await import("@elevenlabs/client");
      let connectedResolve: () => void = () => {};
      const connected = new Promise<void>((r) => (connectedResolve = r));
      const conversation = (await Conversation.startSession({
        conversationToken: data.conversationToken!,
        connectionType: "webrtc",
        overrides: data.overrides as never,
        onConnect: () => connectedResolve(),
        onDisconnect: (details) => this.onDisconnect(details),
        onError: (message) => console.warn("[elevenlabs] error:", typeof message === "string" ? message.slice(0, 120) : "unknown"),
        onMessage: (m) => {
          const role = (m as { role?: string; source?: string }).role ?? (m as { source?: string }).source;
          const text = String(m.message ?? "").trim();
          if (!text) return;
          if (role === "user" && this.collectTranscript) this.pushTurn("child", text);
          if (role === "agent" || role === "ai") this.pushTurn("santa", text);
        },
        onModeChange: ({ mode }) => {
          this.mode = mode;
          if (mode === "speaking" && this.childSpeaking) {
            this.childSpeaking = false;
            this.events.onChildSpeaking?.(false);
          }
        },
      })) as VoiceConversation;
      this.conversation = conversation;
      await Promise.race([connected, new Promise<void>((_, rej) => setTimeout(() => rej(new Error("timeout")), 20_000))]);
    } catch (e) {
      await this.notifyEnd("error", 0);
      throw this.fail(e instanceof Error && e.message === "timeout" ? "connect_timeout" : "connect_failed");
    }
    if (this.ended) {
      await this.conversation?.endSession().catch(() => {});
      return;
    }

    const ack = await fetch(`/api/call/${this.callId}/connected`, { method: "POST" }).catch(() => null);
    if (!ack || !ack.ok) {
      await this.notifyEnd("error", 0);
      await this.conversation?.endSession().catch(() => {});
      throw this.fail("connect_failed");
    }

    this.connectedAt = Date.now();
    this.startTimers();
    this.setPhase("connected");
    this.events.onConnected?.({ connectedAt: this.connectedAt, maxSeconds: this.maxSeconds });
  }

  private onDisconnect(details: { reason: string }) {
    if (this.ended) return;
    // "agent" means the agent ended the call (e.g. its own time cap); "error" is a dropped line.
    void this.end(details.reason === "error" && this.connectedAt ? "connection_lost" : "user_hangup", { skipSessionEnd: true });
  }

  private startTimers() {
    if (this.maxSeconds > WRAP_UP_LEAD_SECONDS + 15) {
      this.timers.push(setTimeout(() => this.sendWrapUp(WRAP_UP_LEAD_SECONDS), (this.maxSeconds - WRAP_UP_LEAD_SECONDS) * 1000));
    }
    this.timers.push(setTimeout(() => void this.end("time_limit"), this.maxSeconds * 1000));
    this.intervals.push(
      setInterval(() => this.events.onRemaining?.(Math.max(0, this.maxSeconds - this.elapsedSeconds)), 1000),
      setInterval(() => void this.heartbeat(), HEARTBEAT_MS),
      setInterval(() => this.pollChildSpeaking(), 150),
    );
  }

  private pollChildSpeaking() {
    if (!this.conversation || this.ended) return;
    const speaking = this.mode === "listening" && this.conversation.getInputVolume() > CHILD_SPEAKING_THRESHOLD;
    if (speaking !== this.childSpeaking) {
      this.childSpeaking = speaking;
      this.events.onChildSpeaking?.(speaking);
    }
  }

  private async heartbeat() {
    if (!this.callId || this.ended) return;
    try {
      const res = await fetch(`/api/call/${this.callId}/heartbeat`, { method: "POST" });
      if (!res.ok) return;
      const data = (await res.json()) as { stop?: boolean; reason?: string; remainingSeconds?: number };
      if (data.stop) void this.end(data.reason === "time_limit" ? "time_limit" : "server_stop", { skipServerNotify: true });
      else if (typeof data.remainingSeconds === "number" && data.remainingSeconds <= WRAP_UP_LEAD_SECONDS) this.sendWrapUp(data.remainingSeconds);
    } catch {
      /* transient */
    }
  }

  private sendWrapUp(secondsLeft: number) {
    if (this.wrapUpSent || this.ended || !this.conversation) return;
    this.wrapUpSent = true;
    this.conversation.sendContextualUpdate(wrapUpNudge(secondsLeft));
  }

  private pushTurn(role: TranscriptTurn["role"], text: string) {
    this.transcript.push({ role, text: text.slice(0, 4000) });
    if (this.transcript.length > 400) this.transcript.shift();
  }

  /* ------------------------------ Controls ------------------------------ */

  async setMuted(muted: boolean) {
    this.conversation?.setMicMuted(muted);
    if (muted && this.childSpeaking) {
      this.childSpeaking = false;
      this.events.onChildSpeaking?.(false);
    }
  }

  async listOutputs(): Promise<{ deviceId: string; label: string }[]> {
    if (!navigator.mediaDevices?.enumerateDevices || !("setSinkId" in HTMLMediaElement.prototype)) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "audiooutput")
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || (d.deviceId === "default" ? "System default" : `Speaker ${i + 1}`) }));
  }

  async setOutputDevice(deviceId: string) {
    await this.conversation?.changeOutputDevice({ outputDeviceId: deviceId });
  }

  setSpeakerVolume(loud: boolean) {
    this.volume = loud ? 1 : 0.4;
    this.conversation?.setVolume({ volume: this.volume });
  }

  /** Fills `out` with Santa's real output levels (0..1) and returns overall loudness. */
  readOutputLevels(out: Float32Array): number {
    if (!this.conversation) {
      out.fill(0);
      return 0;
    }
    let data: Uint8Array;
    try {
      data = this.conversation.getOutputByteFrequencyData();
    } catch {
      out.fill(0);
      return 0;
    }
    if (!data?.length) {
      out.fill(0);
      return 0;
    }
    const per = data.length / out.length;
    let total = 0;
    for (let i = 0; i < out.length; i++) {
      let sum = 0;
      const start = Math.floor(i * per);
      const end = Math.max(start + 1, Math.floor((i + 1) * per));
      for (let j = start; j < end; j++) sum += data[j]!;
      const v = sum / (end - start) / 255;
      out[i] = v;
      total += v;
    }
    return total / out.length;
  }

  /* ------------------------------ Ending ------------------------------ */

  async end(reason: EndReason, opts: { skipServerNotify?: boolean; skipSessionEnd?: boolean } = {}) {
    if (this.ended) return;
    this.ended = true;
    const duration = this.elapsedSeconds;
    if (this.connectedAt) this.setPhase("ending");
    if (!opts.skipSessionEnd) await this.conversation?.endSession().catch(() => {});
    if (!opts.skipServerNotify) await this.notifyEnd(reason, duration);
    else void this.notifyEnd(reason, duration);
    this.cleanup();
    this.setPhase("ended");
    this.events.onEnded?.({ reason, durationSec: duration, dropped: reason === "connection_lost" });
  }

  async cancel() {
    if (this.ended) return;
    this.ended = true;
    await this.conversation?.endSession().catch(() => {});
    if (this.callId) await this.notifyEnd("cancelled", 0);
    this.cleanup();
    this.setPhase("ended");
  }

  private async notifyEnd(reason: EndReason, durationSec: number) {
    if (!this.callId) return;
    const body = JSON.stringify({ reason, durationSec, transcript: this.collectTranscript ? this.transcript : undefined });
    try {
      await fetch(`/api/call/${this.callId}/end`, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: body.length < 60_000 });
    } catch {
      /* the server's sweeper will close it */
    }
  }

  private installPageHide() {
    if (this.pageHideHandler) return;
    this.pageHideHandler = () => {
      if (this.ended || !this.callId) return;
      this.ended = true;
      const payload = JSON.stringify({ reason: "page_closed", durationSec: this.elapsedSeconds, transcript: this.collectTranscript ? this.transcript : undefined });
      navigator.sendBeacon?.(`/api/call/${this.callId}/end`, new Blob([payload], { type: "application/json" }));
      void this.conversation?.endSession().catch(() => {});
      this.cleanup();
    };
    window.addEventListener("pagehide", this.pageHideHandler);
  }

  private fail(code: CallErrorCode, message?: string) {
    const err = new CallError(code, message ?? friendlyError(code));
    if (!this.ended) {
      this.ended = true;
      void this.conversation?.endSession().catch(() => {});
      this.cleanup();
      this.setPhase("error");
      this.events.onError?.(code, err.message);
    }
    return err;
  }

  private cleanup() {
    this.timers.forEach(clearTimeout);
    this.intervals.forEach(clearInterval);
    this.timers = [];
    this.intervals = [];
    if (this.pageHideHandler) window.removeEventListener("pagehide", this.pageHideHandler);
    this.pageHideHandler = null;
    this.micProbe?.getTracks().forEach((t) => t.stop());
    this.conversation = null;
  }
}
