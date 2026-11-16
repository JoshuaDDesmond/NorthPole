import { formatDuration } from "@/lib/time";
import { CallButton } from "./CallControls";

type Props = {
  durationSec: number;
  variant: "ended" | "dropped" | "time_limit" | "parent_stop";
  onCallAgain: () => void;
  canCallAgain?: boolean;
};

const COPY = {
  ended: { title: "Call ended", body: "The North Pole is always happy to hear from you." },
  time_limit: { title: "Call ended", body: "That's all the time on the line for now. The North Pole is always happy to hear from you." },
  dropped: { title: "The line dropped", body: "Sometimes the signal from the North Pole gets a little snowy. You can call right back." },
  parent_stop: { title: "Call ended", body: "Santa's line is closed for now. The North Pole is always happy to hear from you." },
};

export function CallEndedScreen({ durationSec, variant, onCallAgain, canCallAgain = true }: Props) {
  const copy = COPY[variant];
  return (
    <div className="flex flex-col items-center gap-2 text-center animate-fade-in">
      <h2 className="text-2xl font-semibold tracking-tight text-snow">{copy.title}</h2>
      <p className="max-w-[280px] text-[15px] leading-relaxed text-mist">{copy.body}</p>
      {durationSec > 0 && <p className="mt-2 text-sm tabular-nums text-gold">{formatDuration(durationSec)}</p>}
      {canCallAgain && (
        <div className="mt-8">
          <CallButton onClick={onCallAgain} label={variant === "dropped" ? "Call Back" : "Call Santa Again"} />
        </div>
      )}
    </div>
  );
}
