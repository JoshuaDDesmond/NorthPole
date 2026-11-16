"use client";

import { Check, ChevronLeft, Info, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Ambience } from "@/lib/client/ambience";
import { VoiceSessionManager, type CallPhase, type EndInfo, type TranscriptTurn } from "@/lib/client/voice-session";
import { AudioWaveform } from "./AudioWaveform";
import { CallButton, CallControls } from "./CallControls";
import { CallEndedScreen } from "./CallEndedScreen";
import { CallTimer } from "./CallTimer";
import { ConnectionStatus } from "./ConnectionStatus";
import { PhoneFrame } from "./PhoneFrame";
import { SantaContactPhoto } from "./SantaContactPhoto";

type Props = {
  childId: string;
  childName: string;
  photoUrl: string;
  ambientSound: boolean;
  canSwitchCaller: boolean;
};

type View = "idle" | "calling" | "connected" | "ended" | "error";
type WakeLockHandle = { release: () => Promise<void> };

export function CallScreen({ childId, childName, photoUrl, ambientSound, canSwitchCaller }: Props) {
  const [view, setView] = useState<View>("idle");
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [endInfo, setEndInfo] = useState<EndInfo | null>(null);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [outputs, setOutputs] = useState<{ deviceId: string; label: string }[] | null>(null);
  const [selectedOutput, setSelectedOutput] = useState("default");
  const [santaSpeaking, setSantaSpeaking] = useState(false);
  const [childSpeaking, setChildSpeaking] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const managerRef = useRef<VoiceSessionManager | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ambienceRef = useRef<Ambience | null>(null);
  const wakeLockRef = useRef<WakeLockHandle | null>(null);
  const autoRetriedRef = useRef(false);
  const startCallRef = useRef<(resume?: { callId: string; transcript: TranscriptTurn[] }) => Promise<void>>(async () => {});

  const releaseExtras = useCallback(() => {
    ambienceRef.current?.stop();
    ambienceRef.current = null;
    void wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  const startCall = useCallback(
    async (resume?: { callId: string; transcript: TranscriptTurn[] }) => {
      if (!resume) autoRetriedRef.current = false;
      setError(null);
      setEndInfo(null);
      setMuted(false);
      setRemaining(null);
      setSantaSpeaking(false);
      setChildSpeaking(false);
      setView("calling");

      // Create/unlock audio inside the user gesture so mobile browsers allow playback.
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new Ctor();
      }
      void audioCtxRef.current.resume().catch(() => {});

      const manager = new VoiceSessionManager(childId, {
        onPhase: setPhase,
        onError: (code, message) => {
          releaseExtras();
          setError({ code, message });
          setView("error");
        },
        onConnected: ({ connectedAt: at }) => {
          setConnectedAt(at);
          setView("connected");
          if (!speakerOn) manager.setSpeakerVolume(false);
          if (selectedOutput !== "default") void manager.setOutputDevice(selectedOutput).catch(() => {});
          if (ambientSound && audioCtxRef.current) {
            ambienceRef.current = new Ambience(audioCtxRef.current);
            ambienceRef.current.start();
          }
          const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockHandle> } }).wakeLock;
          wl?.request("screen").then((h) => (wakeLockRef.current = h)).catch(() => {});
        },
        onChildSpeaking: setChildSpeaking,
        onRemaining: setRemaining,
        onEnded: (info) => {
          releaseExtras();
          setSantaSpeaking(false);
          setChildSpeaking(false);
          const lastId = manager.currentCallId;
          // One automatic, seamless reconnect if the line drops mid-call.
          if (info.dropped && !autoRetriedRef.current && lastId) {
            autoRetriedRef.current = true;
            void startCallRef.current({ callId: lastId, transcript: manager.transcriptSoFar });
            return;
          }
          setEndInfo(info);
          setView("ended");
        },
      });
      managerRef.current = manager;
      try {
        await manager.start({ audioContext: audioCtxRef.current, resumeOfCallId: resume?.callId, resumeTranscript: resume?.transcript });
      } catch {
        /* surfaced through onError */
      }
    },
    [childId, ambientSound, releaseExtras, speakerOn, selectedOutput],
  );

  useEffect(() => {
    startCallRef.current = startCall;
  }, [startCall]);

  // Release everything if the component unmounts mid-call.
  useEffect(() => {
    return () => {
      void managerRef.current?.end("page_closed");
      releaseExtras();
      void audioCtxRef.current?.close().catch(() => {});
    };
  }, [releaseExtras]);

  const handleEnd = useCallback(() => {
    const m = managerRef.current;
    if (!m) return;
    if (m.phase === "connected" || m.phase === "reconnecting") void m.end("user_hangup");
    else {
      void m.cancel();
      releaseExtras();
      setView("idle");
    }
  }, [releaseExtras]);

  const toggleMute = useCallback(async () => {
    const next = !muted;
    setMuted(next);
    await managerRef.current?.setMuted(next);
  }, [muted]);

  const handleSpeaker = useCallback(async () => {
    const m = managerRef.current;
    if (!m) return;
    if (VoiceSessionManager.supportsOutputSelection()) {
      const list = await m.listOutputs().catch(() => []);
      if (list.length > 1) {
        setOutputs(list);
        return;
      }
    }
    const next = !speakerOn;
    setSpeakerOn(next);
    m.setSpeakerVolume(next);
  }, [speakerOn]);

  const chooseOutput = useCallback(async (deviceId: string) => {
    setSelectedOutput(deviceId);
    setOutputs(null);
    try {
      await managerRef.current?.setOutputDevice(deviceId);
    } catch {
      /* device vanished; keep current routing */
    }
  }, []);

  const readLevels = useCallback((out: Float32Array) => {
    const m = managerRef.current;
    if (!m) {
      out.fill(0);
      return 0;
    }
    return m.readOutputLevels(out);
  }, []);

  const endedVariant =
    endInfo?.reason === "connection_lost"
      ? "dropped"
      : endInfo?.reason === "time_limit"
        ? "time_limit"
        : endInfo?.reason === "server_stop"
          ? "parent_stop"
          : "ended";

  const activityLabel = muted ? "You're muted" : santaSpeaking ? "Santa is talking" : childSpeaking ? "Santa is listening" : " ";
  const blockingError = error && ["daily_limit", "call_limit", "calling_disabled", "child_disabled", "consent_required", "voice_not_configured"].includes(error.code);

  return (
    <PhoneFrame>
      <div className="np-safe flex flex-1 flex-col px-6">
        {/* Header */}
        <header className="relative flex flex-col items-center pt-2 text-center">
          {canSwitchCaller && view !== "connected" && view !== "calling" && (
            <Link href="/" className="absolute left-0 top-1 flex h-9 w-9 items-center justify-center rounded-full text-mist transition hover:bg-white/5 hover:text-snow" aria-label="Choose a different caller">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => setShowInfo(true)}
            className="absolute right-0 top-1 flex h-9 w-9 items-center justify-center rounded-full text-mist/70 transition hover:bg-white/5 hover:text-snow"
            aria-label="About this call"
          >
            <Info className="h-[18px] w-[18px]" />
          </button>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gold">North Pole Direct Line</p>
          <p className="mt-1.5 text-xs text-mist">A private connection to Santa&apos;s Workshop</p>
        </header>

        {/* Center */}
        <section className="flex flex-1 flex-col items-center justify-center gap-7 py-8">
          <SantaContactPhoto src={photoUrl} ringing={view === "calling"} live={view === "connected"} />
          <div className="flex min-h-[92px] flex-col items-center gap-1.5 text-center">
            <h1 className="text-[28px] font-semibold tracking-tight text-snow">Santa Claus</h1>
            {view === "idle" && (
              <>
                <p className="text-[15px] text-mist">North Pole Workshop</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-call">
                  <span className="h-1.5 w-1.5 rounded-full bg-call" />
                  Available for a call
                </p>
              </>
            )}
            {view === "calling" && <ConnectionStatus phase={phase === "requesting_mic" ? "requesting_mic" : phase === "reconnecting" ? "reconnecting" : "connecting"} />}
            {view === "connected" && (
              <>
                <ConnectionStatus phase={phase === "reconnecting" ? "reconnecting" : "connected"} />
                <p className="text-lg text-snow/90">{connectedAt && <CallTimer since={connectedAt} />}</p>
              </>
            )}
          </div>

          {view === "connected" && (
            <div className="flex w-full flex-col items-center gap-3 animate-fade-in">
              <AudioWaveform readLevels={readLevels} onSpeakingChange={setSantaSpeaking} />
              <p className="h-5 text-xs font-medium tracking-wide text-mist" aria-live="polite">
                {activityLabel}
              </p>
              {remaining !== null && remaining <= 60 && remaining > 0 && (
                <p className="rounded-full border border-gold/30 px-3 py-1 text-xs text-gold">About a minute left on the line</p>
              )}
            </div>
          )}

          {view === "ended" && endInfo && <CallEndedScreen durationSec={endInfo.durationSec} variant={endedVariant} onCallAgain={() => void startCall()} />}

          {view === "error" && error && (
            <div className="flex max-w-[300px] flex-col items-center gap-5 text-center animate-fade-in" role="alert">
              <p className="text-[15px] leading-relaxed text-snow/90">{error.message}</p>
              {error.code === "mic_denied" && (
                <p className="text-xs leading-relaxed text-mist">
                  On iPhone: Settings › Safari › Microphone. In Chrome: tap the icon beside the web address and allow the microphone.
                </p>
              )}
              <button
                type="button"
                onClick={() => (blockingError ? setView("idle") : void startCall())}
                className="rounded-full bg-white/10 px-6 py-2.5 text-sm font-medium text-snow ring-1 ring-inset ring-line transition hover:bg-white/15"
              >
                {blockingError ? "OK" : "Try again"}
              </button>
            </div>
          )}
        </section>

        {/* Bottom controls */}
        <footer className="flex flex-col items-center gap-5 pb-2">
          {view === "idle" && (
            <>
              <CallButton onClick={() => void startCall()} />
              <div className="flex flex-col items-center gap-1 text-center">
                <p className="text-sm text-mist">Your private line to the North Pole</p>
                <p className="text-[11px] text-mist/60">
                  Calling as {childName} · An AI-powered Santa experience
                </p>
              </div>
            </>
          )}
          {(view === "calling" || view === "connected") && (
            <CallControls
              muted={muted}
              speakerOn={speakerOn}
              onToggleMute={() => void toggleMute()}
              onSpeaker={() => void handleSpeaker()}
              onEnd={handleEnd}
              disabled={view !== "connected"}
            />
          )}
          {view === "ended" && <p className="text-[11px] text-mist/60">An AI-powered Santa experience</p>}
        </footer>
      </div>

      {outputs && (
        <Sheet title="Audio output" onClose={() => setOutputs(null)}>
          <ul className="flex flex-col">
            {outputs.map((o) => (
              <li key={o.deviceId}>
                <button
                  type="button"
                  onClick={() => void chooseOutput(o.deviceId)}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm text-snow transition hover:bg-white/5"
                >
                  {o.label}
                  {selectedOutput === o.deviceId && <Check className="h-4 w-4 text-gold" />}
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      {showInfo && (
        <Sheet title="About this call" onClose={() => setShowInfo(false)}>
          <div className="space-y-3 px-1 text-sm leading-relaxed text-mist">
            <p>
              Santa&apos;s voice reaches you through some clever <span className="text-snow">AI-powered</span> North Pole technology. The Christmas spirit part is completely real.
            </p>
            <p>Calls aren&apos;t recorded. Your family may see a short note about what you talked about, so Santa can remember it next time.</p>
            <p>If anything ever feels wrong or upsetting, hang up and talk to a grown-up you trust.</p>
          </div>
        </Sheet>
      )}
    </PhoneFrame>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex items-end bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="w-full rounded-t-[28px] border-t border-line bg-ink-2 px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="text-base font-semibold text-snow">{title}</h2>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-mist hover:bg-white/5" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
