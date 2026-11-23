"use client";

import { isGoodbye, isSantaGoodbye, keepGoingNudge, timeToWrapUpNudge, wrapUpNudge } from "../santa/prompt";
import { GoodbyeFlow } from "./goodbye";

/**
 * VoiceSessionManager
 * --------------------
 * Owns one real, two-way voice call with the OpenAI Realtime API over WebRTC:
 *   microphone capture -> RTCPeerConnection -> our server relays the SDP offer
 *   (with Santa's session config) -> OpenAI answers -> live audio both ways.
 *
 * Turn-taking and barge-in are handled by the Realtime API's voice activity
 * detection (interrupt_response=true); over WebRTC the server truncates
 * unplayed audio automatically when the child starts talking.
 */

export type CallPhase = "idle" | "requesting_mic" | "connecting" | "connected" | "reconnecting" | "ending" | "ended" | "error";

export type CallErrorCode =
  | "mic_denied"
  | "mic_missing"
  | "mic_error"
  | "unsupported"
  | "connect_failed"
  | "connect_timeout"
  | "dropped"
  | string;

export type TranscriptTurn = { role: "child" | "santa"; text: string };

export type EndInfo = {
  reason: EndReason;
  durationSec: number;
  dropped: boolean;
};

export type EndReason = "user_hangup" | "goodbye" | "santa_hangup" | "time_limit" | "connection_lost" | "error" | "page_closed" | "cancelled" | "server_stop";

export type VoiceSessionEvents = {
  onPhase?: (phase: CallPhase) => void;
  onError?: (code: CallErrorCode, message: string) => void;
  onConnected?: (info: { connectedAt: number; maxSeconds: number }) => void;
  onEnded?: (info: EndInfo) => void;
  onChildSpeaking?: (speaking: boolean) => void;
  onRemaining?: (seconds: number) => void;
};

const CONNECT_TIMEOUT_MS = 20_000;
const HEARTBEAT_MS = 20_000;
const WRAP_UP_LEAD_SECONDS = 45;
const DISCONNECT_GRACE_MS = 6_000;

export class CallError extends Error {
  constructor(
    public code: CallErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const FRIENDLY: Record<string, string> = {
  mic_denied: "Santa can't hear you yet. Please allow microphone access in your browser settings, then try again.",
  mic_missing: "We couldn't find a microphone on this device.",
  mic_error: "Your microphone couldn't be started. Close other apps using it and try again.",
  unsupported: "This browser can't make North Pole calls. Try the latest Safari or Chrome.",
  connect_failed: "We couldn't connect to the North Pole. Please check your internet connection and try again.",
  connect_timeout: "The North Pole is taking too long to answer. Please try again in a moment.",
  dropped: "The line to the North Pole dropped.",
};

export function friendlyError(code: string, fallback?: string) {
  return FRIENDLY[code] ?? fallback ?? "Something went wrong with the call. Please try again.";
}

export class VoiceSessionManager {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private micStream: MediaStream | null = null;
  private micTrack: MediaStreamTrack | null = null;
  private sender: RTCRtpSender | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserData: Uint8Array<ArrayBuffer> | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private intervals: ReturnType<typeof setInterval>[] = [];
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pageHideHandler: (() => void) | null = null;

  private _phase: CallPhase = "idle";
  private callId: string | null = null;
  private connectedAt = 0;
  private maxSeconds = 0;
  private collectTranscript = false;
  private transcript: TranscriptTurn[] = [];
  private muted = false;
  private ended = false;
  private wrapUpSent = false;
  private responding = false;
  private pacing: { keepGoingAt: number | null; wrapUpAt: number } | null = null;
  /** Santa's goodbye, one answer from the child, Santa's last word, then hang up. */
  private goodbye = new GoodbyeFlow(() => void this.end("goodbye"));
  /** Santa may only start the goodbyes himself once he's been told it's time. */
  private wrapUpCueSent = false;

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
  get isMuted() {
    return this.muted;
  }
  get elapsedSeconds() {
    return this.connectedAt ? Math.floor((Date.now() - this.connectedAt) / 1000) : 0;
  }

  private setPhase(p: CallPhase) {
    this._phase = p;
    this.events.onPhase?.(p);
  }

  /**
   * Must be called from a user gesture (the Call button) so mobile browsers
   * allow audio playback and microphone capture.
   */
  async start(opts: { audioContext: AudioContext; resumeOfCallId?: string; resumeTranscript?: TranscriptTurn[] }) {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      throw this.fail("unsupported");
    }
    this.audioCtx = opts.audioContext;
    this.setPhase(opts.resumeOfCallId ? "reconnecting" : "requesting_mic");

    // 1. Microphone
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        video: false,
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      throw this.fail(name === "NotAllowedError" || name === "SecurityError" ? "mic_denied" : name === "NotFoundError" ? "mic_missing" : "mic_error");
    }
    if (this.ended) return this.cleanup();
    this.micTrack = this.micStream.getAudioTracks()[0] ?? null;
    if (!this.micTrack) throw this.fail("mic_missing");
    if (!opts.resumeOfCallId) this.setPhase("connecting");

    // 2. Peer connection with remote audio playback + analysis
    const pc = new RTCPeerConnection();
    this.pc = pc;
    const audioEl = new Audio();
    audioEl.autoplay = true;
    audioEl.setAttribute("playsinline", "true");
    this.audioEl = audioEl;
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      audioEl.srcObject = stream;
      void audioEl.play().catch(() => {});
      this.attachAnalyser(stream);
    };
    this.sender = pc.addTrack(this.micTrack, this.micStream);

    const dc = pc.createDataChannel("oai-events");
    this.dc = dc;
    dc.onmessage = (e) => this.onServerEvent(e.data);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // 3. Our server creates the authenticated Realtime call and returns the SDP answer.
    let res: Response;
    try {
      res = await fetch("/api/call/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childId: this.childId,
          sdp: offer.sdp,
          resumeOfCallId: opts.resumeOfCallId,
          resumeTranscript: opts.resumeTranscript?.slice(-12),
        }),
      });
    } catch {
      throw this.fail("connect_failed");
    }
    const data = (await res.json().catch(() => ({}))) as {
      callId?: string;
      answerSdp?: string;
      maxSeconds?: number;
      pacing?: { keepGoingAt: number | null; wrapUpAt: number };
      collectTranscript?: boolean;
      error?: { code: string; message: string };
    };
    if (!res.ok || !data.callId || !data.answerSdp) {
      throw this.fail(data.error?.code ?? "connect_failed", data.error?.message);
    }
    this.callId = data.callId;
    this.maxSeconds = data.maxSeconds ?? 600;
    this.pacing = data.pacing ?? null;
    this.collectTranscript = Boolean(data.collectTranscript);
    if (opts.resumeTranscript) this.transcript = [...opts.resumeTranscript];
    this.installPageHide();

    if (this.ended) {
      await this.notifyEnd("cancelled", 0);
      return this.cleanup();
    }

    try {
      await pc.setRemoteDescription({ type: "answer", sdp: data.answerSdp });
    } catch {
      await this.notifyEnd("error", 0);
      throw this.fail("connect_failed");
    }

    // 4. Only report "connected" once media and the event channel are truly up.
    try {
      await this.waitForConnection(pc, dc);
    } catch (e) {
      await this.notifyEnd("error", 0);
      throw e;
    }
    if (this.ended) return;

    const ack = await fetch(`/api/call/${this.callId}/connected`, { method: "POST" }).catch(() => null);
    if (!ack || !ack.ok) {
      await this.notifyEnd("error", 0);
      throw this.fail("connect_failed");
    }

    this.connectedAt = Date.now();
    this.watchConnection(pc);
    this.startTimers();
    this.setPhase("connected");
    this.events.onConnected?.({ connectedAt: this.connectedAt, maxSeconds: this.maxSeconds });

    // Santa answers the phone first.
    this.send({ type: "response.create" });
  }

  private waitForConnection(pc: RTCPeerConnection, dc: RTCDataChannel) {
    return new Promise<void>((resolve, reject) => {
      const done = () => pc.connectionState === "connected" && dc.readyState === "open";
      if (done()) return resolve();
      const timeout = setTimeout(() => {
        cleanup();
        reject(this.fail("connect_timeout"));
      }, CONNECT_TIMEOUT_MS);
      const check = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          cleanup();
          reject(this.fail("connect_failed"));
        } else if (done()) {
          cleanup();
          resolve();
        }
      };
      const cleanup = () => {
        clearTimeout(timeout);
        pc.removeEventListener("connectionstatechange", check);
        dc.removeEventListener("open", check);
      };
      pc.addEventListener("connectionstatechange", check);
      dc.addEventListener("open", check);
    });
  }

  private watchConnection(pc: RTCPeerConnection) {
    pc.addEventListener("connectionstatechange", () => {
      if (this.ended) return;
      const s = pc.connectionState;
      if (s === "connected") {
        if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
        this.disconnectTimer = null;
        if (this._phase === "reconnecting") this.setPhase("connected");
      } else if (s === "disconnected") {
        // Brief network blips often recover by themselves.
        this.setPhase("reconnecting");
        this.disconnectTimer = setTimeout(() => {
          if (pc.connectionState !== "connected") void this.end("connection_lost");
        }, DISCONNECT_GRACE_MS);
      } else if (s === "failed" || s === "closed") {
        void this.end("connection_lost");
      }
    });
    if (this.dc) {
      this.dc.onclose = () => {
        if (!this.ended) void this.end("connection_lost");
      };
    }
  }

  private startTimers() {
    // Local enforcement of the call length (server enforces it too).
    const wrapAt = Math.max(0, this.maxSeconds - WRAP_UP_LEAD_SECONDS) * 1000;
    if (this.maxSeconds > WRAP_UP_LEAD_SECONDS + 15) {
      this.timers.push(setTimeout(() => this.sendWrapUp(WRAP_UP_LEAD_SECONDS), wrapAt));
    }
    this.timers.push(setTimeout(() => void this.end("time_limit"), this.maxSeconds * 1000));
    // Quiet pacing cues: the model has no clock, so the app tells Santa when to keep going and when to wrap up.
    if (this.pacing?.keepGoingAt) this.timers.push(setTimeout(() => this.sendSystemNote(keepGoingNudge()), this.pacing.keepGoingAt * 1000));
    if (this.pacing && this.pacing.wrapUpAt < this.maxSeconds - WRAP_UP_LEAD_SECONDS) {
      this.timers.push(setTimeout(() => {
        this.wrapUpCueSent = true;
        this.sendSystemNote(timeToWrapUpNudge());
      }, this.pacing.wrapUpAt * 1000));
    }
    this.intervals.push(
      setInterval(() => {
        const remaining = Math.max(0, this.maxSeconds - this.elapsedSeconds);
        this.events.onRemaining?.(remaining);
      }, 1000),
    );
    this.intervals.push(setInterval(() => void this.heartbeat(), HEARTBEAT_MS));
  }

  private async heartbeat() {
    if (!this.callId || this.ended) return;
    try {
      const res = await fetch(`/api/call/${this.callId}/heartbeat`, { method: "POST" });
      if (!res.ok) return;
      const data = (await res.json()) as { stop?: boolean; reason?: string; remainingSeconds?: number };
      if (data.stop) {
        void this.end(data.reason === "time_limit" ? "time_limit" : "server_stop", { skipServerNotify: true });
      } else if (typeof data.remainingSeconds === "number" && data.remainingSeconds <= WRAP_UP_LEAD_SECONDS) {
        this.sendWrapUp(data.remainingSeconds);
      }
    } catch {
      /* transient network issue; the connection watcher handles real drops */
    }
  }

  /** Adds a quiet instruction to the conversation without prompting Santa to speak. */
  private sendSystemNote(text: string) {
    if (this.ended || this.goodbye.active) return;
    this.send({ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text }] } });
  }

  /** Goodbyes have started (the child's or Santa's). See GoodbyeFlow for how the call ends. */
  private beginClosing() {
    if (this.ended || this.elapsedSeconds < 15) return;
    this.goodbye.begin();
  }

  private sendWrapUp(secondsLeft: number) {
    if (this.wrapUpSent || this.ended) return;
    this.wrapUpSent = true;
    this.wrapUpCueSent = true;
    this.send({
      type: "conversation.item.create",
      item: { type: "message", role: "system", content: [{ type: "input_text", text: wrapUpNudge(secondsLeft) }] },
    });
    if (!this.responding) this.send({ type: "response.create" });
  }

  private onServerEvent(raw: unknown) {
    if (typeof raw !== "string") return;
    let ev: { type?: string; transcript?: string; error?: { code?: string; type?: string } };
    try {
      ev = JSON.parse(raw);
    } catch {
      return;
    }
    switch (ev.type) {
      case "input_audio_buffer.speech_started":
        this.goodbye.childSpoke();
        this.events.onChildSpeaking?.(true);
        break;
      case "input_audio_buffer.speech_stopped":
        this.events.onChildSpeaking?.(false);
        break;
      case "response.created":
        this.responding = true;
        this.goodbye.santaStarted();
        break;
      case "output_audio_buffer.started":
        this.goodbye.santaStarted();
        break;
      case "response.done":
        this.responding = false;
        break;
      case "output_audio_buffer.stopped":
        // Santa finished speaking (or was talked over).
        this.goodbye.santaFinished();
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (this.collectTranscript && ev.transcript?.trim()) this.pushTurn("child", ev.transcript);
        if (ev.transcript && isGoodbye(ev.transcript)) this.beginClosing();
        break;
      case "response.output_audio_transcript.done":
        if (ev.transcript?.trim()) {
          this.pushTurn("santa", ev.transcript);
          if (this.wrapUpCueSent && isSantaGoodbye(ev.transcript)) this.beginClosing();
          this.goodbye.santaLine(ev.transcript);
        }
        break;
      case "error":
        // Non-fatal protocol errors (e.g. cancelling an already-finished response). Log the code only.
        console.warn("[realtime] server event error:", ev.error?.code ?? ev.error?.type ?? "unknown");
        break;
    }
  }

  private pushTurn(role: TranscriptTurn["role"], text: string) {
    this.transcript.push({ role, text: text.trim().slice(0, 4000) });
    if (this.transcript.length > 400) this.transcript.shift();
  }

  private send(event: Record<string, unknown>) {
    if (this.dc?.readyState === "open") this.dc.send(JSON.stringify(event));
  }

  /* ------------------------------ Controls ------------------------------ */

  /** Genuinely stops sending microphone audio (the RTP sender carries no track while muted). */
  async setMuted(muted: boolean) {
    this.muted = muted;
    if (this.micTrack) this.micTrack.enabled = !muted;
    if (this.sender) await this.sender.replaceTrack(muted ? null : this.micTrack);
    if (muted) this.events.onChildSpeaking?.(false);
  }

  static supportsOutputSelection() {
    return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
  }

  async listOutputs(): Promise<{ deviceId: string; label: string }[]> {
    if (!VoiceSessionManager.supportsOutputSelection() || !navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "audiooutput")
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || (d.deviceId === "default" ? "System default" : `Speaker ${i + 1}`) }));
  }

  async setOutputDevice(deviceId: string) {
    const el = this.audioEl as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (el?.setSinkId) await el.setSinkId(deviceId);
  }

  /** Fallback when the browser can't pick an output: full "speakerphone" volume vs. quieter handset level. */
  setSpeakerVolume(loud: boolean) {
    if (this.audioEl) this.audioEl.volume = loud ? 1 : 0.4;
  }

  /* ------------------------------ Audio levels ------------------------------ */

  private attachAnalyser(stream: MediaStream) {
    if (!this.audioCtx) return;
    try {
      const source = this.audioCtx.createMediaStreamSource(stream);
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser); // analysis only; playback happens through the <audio> element
      this.analyser = analyser;
      this.analyserData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    } catch {
      this.analyser = null;
    }
  }

  /**
   * Fills `out` with normalized (0..1) levels of Santa's actual outgoing audio.
   * Returns overall loudness (0..1). Returns 0 when there is no audio.
   */
  readOutputLevels(out: Float32Array): number {
    if (!this.analyser || !this.analyserData) {
      out.fill(0);
      return 0;
    }
    this.analyser.getByteFrequencyData(this.analyserData);
    const data = this.analyserData;
    // Voice energy lives mostly in the lower ~60% of bins.
    const usable = Math.floor(data.length * 0.6);
    const per = usable / out.length;
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

  async end(reason: EndReason, opts: { skipServerNotify?: boolean } = {}) {
    if (this.ended) return;
    this.ended = true;
    const duration = this.elapsedSeconds;
    const dropped = reason === "connection_lost";
    if (this.connectedAt) this.setPhase("ending");
    if (!opts.skipServerNotify) await this.notifyEnd(reason, duration);
    else void this.notifyEnd(reason, duration);
    this.cleanup();
    this.setPhase("ended");
    this.events.onEnded?.({ reason, durationSec: duration, dropped });
  }

  /** Abort before connection completes (e.g. user pressed End while connecting). */
  async cancel() {
    if (this.ended) return;
    this.ended = true;
    if (this.callId) await this.notifyEnd("cancelled", 0);
    this.cleanup();
    this.setPhase("ended");
  }

  private async notifyEnd(reason: EndReason, durationSec: number) {
    if (!this.callId) return;
    const id = this.callId;
    const body = JSON.stringify({ reason, durationSec, transcript: this.collectTranscript ? this.transcript : undefined });
    try {
      await fetch(`/api/call/${id}/end`, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: body.length < 60_000 });
    } catch {
      /* the server's sweeper will close it */
    }
  }

  private installPageHide() {
    if (this.pageHideHandler) return;
    this.pageHideHandler = () => {
      if (this.ended || !this.callId) return;
      this.ended = true;
      const payload = JSON.stringify({
        reason: "page_closed",
        durationSec: this.elapsedSeconds,
        transcript: this.collectTranscript ? this.transcript : undefined,
      });
      navigator.sendBeacon?.(`/api/call/${this.callId}/end`, new Blob([payload], { type: "application/json" }));
      this.cleanup();
    };
    window.addEventListener("pagehide", this.pageHideHandler);
  }

  private fail(code: CallErrorCode, message?: string) {
    const err = new CallError(code, message ?? friendlyError(code));
    if (!this.ended) {
      this.ended = true;
      this.cleanup();
      this.setPhase("error");
      this.events.onError?.(code, err.message);
    }
    return err;
  }

  private cleanup() {
    this.goodbye.dispose();
    this.timers.forEach(clearTimeout);
    this.intervals.forEach(clearInterval);
    this.timers = [];
    this.intervals = [];
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    if (this.pageHideHandler) window.removeEventListener("pagehide", this.pageHideHandler);
    this.pageHideHandler = null;
    try {
      this.dc?.close();
    } catch {}
    try {
      this.pc?.getSenders().forEach((s) => s.track?.stop());
      this.pc?.close();
    } catch {}
    this.micStream?.getTracks().forEach((t) => t.stop());
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.srcObject = null;
    }
    this.analyser = null;
    this.dc = null;
    this.pc = null;
    this.micStream = null;
    this.micTrack = null;
    this.sender = null;
  }
}
