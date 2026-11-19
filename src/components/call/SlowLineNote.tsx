"use client";

import { Snowflake } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Friendly, in-world explanations for a slow line. One is picked at random each time. */
export const SLOW_LINE_NOTES = {
  connecting: [
    "Big snowstorm over the North Pole tonight. The line may take a moment.",
    "The reindeer are crowding the workshop antenna again. Almost there!",
    "The northern lights are extra bright tonight, so the line is a little slow.",
    "The elves are shoveling snow off the phone lines. Hang tight!",
  ],
  reply: [
    "A snowstorm is slowing down the North Pole line. Hang tight!",
    "Brrr! A blizzard at the workshop is making the line a little slow.",
    "The northern lights are crackling on the line. Santa will be right with you.",
    "Heavy snow on the North Pole phone lines. Give it a second!",
    "An elf just bumped the workshop antenna. One moment!",
  ],
  reconnecting: [
    "A gust of North Pole wind knocked the line out. Reconnecting...",
    "Snow piled up on the workshop antenna. The elves are brushing it off.",
    "A reindeer tripped over the phone cord. Plugging it back in!",
  ],
} as const;

/** How long to wait before blaming the weather. */
export const SLOW_LINE_TIMING = {
  connectingMs: 5_000,
  /** Santa normally says hello right away. */
  firstHelloMs: 6_000,
  /** Silence after the child finishes talking before the note appears. */
  replyMs: 4_500,
  /** Ignore blips shorter than this (a cough, a door). */
  minChildSpeechMs: 600,
};

const pick = (pool: readonly string[]) => pool[Math.floor(Math.random() * pool.length)];

export type SlowLineActions = {
  callStarted: (resuming: boolean) => void;
  connected: () => void;
  reconnecting: () => void;
  santaSpeaking: (speaking: boolean) => void;
  childSpeaking: (speaking: boolean) => void;
  stop: () => void;
};

/** Shows a weather note when the line is slow; Santa speaking clears it. */
export function useSlowLineNote(): [string | null, SlowLineActions] {
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const childSince = useRef(0);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const arm = useCallback(
    (ms: number, pool: readonly string[]) => {
      clear();
      timer.current = setTimeout(() => setNote(pick(pool)), ms);
    },
    [clear],
  );

  useEffect(() => clear, [clear]);

  const actions = useMemo<SlowLineActions>(
    () => ({
      callStarted: (resuming) => {
        if (resuming) {
          clear();
          setNote(pick(SLOW_LINE_NOTES.reconnecting));
        } else {
          setNote(null);
          arm(SLOW_LINE_TIMING.connectingMs, SLOW_LINE_NOTES.connecting);
        }
      },
      connected: () => {
        setNote(null);
        arm(SLOW_LINE_TIMING.firstHelloMs, SLOW_LINE_NOTES.reply);
      },
      reconnecting: () => {
        clear();
        setNote(pick(SLOW_LINE_NOTES.reconnecting));
      },
      santaSpeaking: (speaking) => {
        if (!speaking) return;
        clear();
        setNote(null);
      },
      childSpeaking: (speaking) => {
        if (speaking) {
          childSince.current = Date.now();
          clear();
        } else if (childSince.current && Date.now() - childSince.current >= SLOW_LINE_TIMING.minChildSpeechMs) {
          arm(SLOW_LINE_TIMING.replyMs, SLOW_LINE_NOTES.reply);
        }
      },
      stop: () => {
        clear();
        setNote(null);
      },
    }),
    [arm, clear],
  );

  return [note, actions];
}

export function SlowLineNote({ note }: { note: string | null }) {
  return (
    <div className="flex min-h-[30px] items-center justify-center" aria-live="polite">
      {note && (
        <p
          data-testid="slow-line-note"
          className="flex max-w-[290px] items-center gap-2 rounded-2xl border border-gold/25 bg-gold/[0.06] px-3.5 py-1.5 text-left text-xs leading-snug text-gold animate-fade-in"
        >
          <Snowflake aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span>{note}</span>
        </p>
      )}
    </div>
  );
}
