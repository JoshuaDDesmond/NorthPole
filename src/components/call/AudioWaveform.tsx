"use client";

import { useEffect, useRef } from "react";

type Props = {
  /** Fills the array with real output levels (0..1) and returns overall loudness. */
  readLevels: (out: Float32Array) => number;
  onSpeakingChange?: (speaking: boolean) => void;
  bars?: number;
};

const SPEAKING_THRESHOLD = 0.035;
const HOLD_MS = 350;

/**
 * Canvas waveform driven by an AnalyserNode on Santa's actual incoming audio
 * track. When there's no audio, it rests as a row of quiet dots.
 */
export function AudioWaveform({ readLevels, onSpeakingChange, bars = 36 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const speakingCb = useRef(onSpeakingChange);
  useEffect(() => {
    speakingCb.current = onSpeakingChange;
  }, [onSpeakingChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const raw = new Float32Array(bars);
    const smooth = new Float32Array(bars);
    let raf = 0;
    let speaking = false;
    let lastLoud = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      const loudness = readLevels(raw);
      const now = performance.now();
      if (loudness > SPEAKING_THRESHOLD) lastLoud = now;
      const isSpeaking = now - lastLoud < HOLD_MS;
      if (isSpeaking !== speaking) {
        speaking = isSpeaking;
        speakingCb.current?.(speaking);
      }

      const { width, height } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);
      const gap = 4;
      const barW = Math.max(2, (width - gap * (bars - 1)) / bars);
      const mid = height / 2;
      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, "rgba(197,164,109,0.35)");
      grad.addColorStop(0.5, "rgba(216,188,138,0.95)");
      grad.addColorStop(1, "rgba(197,164,109,0.35)");
      ctx.fillStyle = grad;

      for (let i = 0; i < bars; i++) {
        // Mirror the spectrum from the center out so speech looks natural.
        const src = Math.abs(i - (bars - 1) / 2) / ((bars - 1) / 2);
        const idx = Math.min(bars - 1, Math.floor(src * (bars - 1) * 0.85));
        const target = Math.min(1, raw[idx]! * 1.6);
        smooth[i] = smooth[i]! + (target - smooth[i]!) * (target > smooth[i]! ? 0.45 : 0.15);
        const h = Math.max(3, smooth[i]! * (height - 6));
        const x = i * (barW + gap);
        const r = Math.min(barW / 2, h / 2);
        ctx.beginPath();
        ctx.roundRect(x, mid - h / 2, barW, h, r);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [readLevels, bars]);

  return <canvas ref={canvasRef} className="h-14 w-full max-w-[300px]" aria-hidden />;
}
