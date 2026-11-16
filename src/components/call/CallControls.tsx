"use client";

import { Mic, MicOff, PhoneOff, Volume2, Volume1 } from "lucide-react";
import type { ReactNode } from "react";

function RoundButton({
  label,
  active,
  onClick,
  children,
  variant = "neutral",
  disabled,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  variant?: "neutral" | "danger";
  disabled?: boolean;
}) {
  const base =
    "flex h-[72px] w-[72px] items-center justify-center rounded-full transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:active:scale-100";
  const style =
    variant === "danger"
      ? "bg-berry text-white shadow-[0_12px_30px_-10px_rgba(165,52,58,0.9)] hover:bg-berry-2"
      : active
        ? "bg-snow text-ink shadow-[0_10px_30px_-12px_rgba(247,243,234,0.6)]"
        : "bg-white/[0.08] text-snow backdrop-blur hover:bg-white/[0.13] ring-1 ring-inset ring-line";
  return (
    <div className="flex flex-col items-center gap-2">
      <button type="button" aria-label={label} aria-pressed={variant === "neutral" ? Boolean(active) : undefined} onClick={onClick} disabled={disabled} className={`${base} ${style}`}>
        {children}
      </button>
      <span className="text-xs font-medium text-mist">{label}</span>
    </div>
  );
}

type Props = {
  muted: boolean;
  speakerOn: boolean;
  speakerLabel?: string;
  onToggleMute: () => void;
  onSpeaker: () => void;
  onEnd: () => void;
  disabled?: boolean;
};

export function CallControls({ muted, speakerOn, speakerLabel = "Speaker", onToggleMute, onSpeaker, onEnd, disabled }: Props) {
  return (
    <div className="grid w-full max-w-[320px] grid-cols-3 place-items-center">
      <RoundButton label={muted ? "Unmute" : "Mute"} active={muted} onClick={onToggleMute} disabled={disabled}>
        {muted ? <MicOff className="h-7 w-7" strokeWidth={1.8} /> : <Mic className="h-7 w-7" strokeWidth={1.8} />}
      </RoundButton>
      <RoundButton label={speakerLabel} active={speakerOn} onClick={onSpeaker} disabled={disabled}>
        {speakerOn ? <Volume2 className="h-7 w-7" strokeWidth={1.8} /> : <Volume1 className="h-7 w-7" strokeWidth={1.8} />}
      </RoundButton>
      <RoundButton label="End Call" variant="danger" onClick={onEnd}>
        <PhoneOff className="h-7 w-7" strokeWidth={1.8} />
      </RoundButton>
    </div>
  );
}

export function CallButton({ onClick, label = "Call Santa", disabled }: { onClick: () => void; label?: string; disabled?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className="group relative flex h-[84px] w-[84px] items-center justify-center rounded-full bg-call text-white shadow-[0_18px_40px_-12px_rgba(47,181,99,0.75)] transition-all duration-200 hover:bg-call-2 active:scale-95 disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" className="h-9 w-9" fill="currentColor" aria-hidden>
          <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z" />
        </svg>
      </button>
      <span className="text-sm font-medium text-snow">{label}</span>
    </div>
  );
}
