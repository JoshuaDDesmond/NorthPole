"use client";

/**
 * Optional, very quiet "warm room" ambience: a soft low rumble with an
 * occasional faint fireplace crackle. Off by default (parent setting). It is
 * clearly background texture and never resembles speech.
 */
export class Ambience {
  private nodes: AudioNode[] = [];
  private master: GainNode | null = null;
  private crackleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private ctx: AudioContext) {}

  start() {
    if (this.master) return;
    const ctx = this.ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    master.connect(ctx.destination);
    this.master = master;

    // Brown noise bed, heavily low-passed.
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 380;
    const bedGain = ctx.createGain();
    bedGain.gain.value = 0.018;
    src.connect(lp).connect(bedGain).connect(master);
    src.start();
    this.nodes.push(src, lp, bedGain);

    const crackle = () => {
      if (!this.master) return;
      const n = ctx.createBufferSource();
      const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.03), ctx.sampleRate);
      const cd = b.getChannelData(0);
      for (let i = 0; i < cd.length; i++) cd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / cd.length, 3);
      n.buffer = b;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1500;
      const g = ctx.createGain();
      g.gain.value = 0.008 + Math.random() * 0.012;
      n.connect(hp).connect(g).connect(this.master);
      n.start();
      this.crackleTimer = setTimeout(crackle, 180 + Math.random() * 1400);
    };
    crackle();
  }

  stop() {
    if (this.crackleTimer) clearTimeout(this.crackleTimer);
    this.crackleTimer = null;
    const master = this.master;
    this.master = null;
    if (!master) return;
    try {
      master.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.4);
    } catch {}
    setTimeout(() => {
      this.nodes.forEach((n) => {
        try {
          if (n instanceof AudioBufferSourceNode) n.stop();
          n.disconnect();
        } catch {}
      });
      this.nodes = [];
      master.disconnect();
    }, 500);
  }
}
