export function ConnectingDots() {
  return (
    <span aria-hidden className="ml-0.5 inline-flex gap-0.5">
      <span className="animate-dots">.</span>
      <span className="animate-dots [animation-delay:0.2s]">.</span>
      <span className="animate-dots [animation-delay:0.4s]">.</span>
    </span>
  );
}

type Props = {
  phase: "requesting_mic" | "connecting" | "connected" | "reconnecting";
};

export function ConnectionStatus({ phase }: Props) {
  if (phase === "connected") {
    return (
      <p className="flex items-center justify-center gap-2 text-sm text-mist">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-call/70 animate-pulse-soft" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-call" />
        </span>
        Connected to North Pole Workshop
      </p>
    );
  }
  const label =
    phase === "requesting_mic" ? "Waiting for your microphone" : phase === "reconnecting" ? "Reconnecting to the North Pole" : "Connecting to the North Pole";
  return (
    <p className="text-sm text-mist" role="status" aria-live="polite">
      {label}
      <ConnectingDots />
    </p>
  );
}
