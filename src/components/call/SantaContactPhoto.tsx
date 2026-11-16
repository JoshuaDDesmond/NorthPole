/* eslint-disable @next/next/no-img-element -- served from our authenticated photo route */

type Props = {
  src: string;
  size?: number;
  ringing?: boolean;
  live?: boolean;
};

/**
 * The contact photo is always completely static. Only the rings around it
 * animate (while connecting), the way a phone shows an outgoing call.
 */
export function SantaContactPhoto({ src, size = 160, ringing = false, live = false }: Props) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {ringing && (
        <>
          <span className="absolute inset-0 rounded-full border border-gold/40 animate-ring" aria-hidden />
          <span className="absolute inset-0 rounded-full border border-gold/30 animate-ring [animation-delay:1.1s]" aria-hidden />
        </>
      )}
      <div
        className={`relative h-full w-full overflow-hidden rounded-full bg-ink-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] ring-1 transition-[box-shadow] duration-700 ${
          live ? "ring-gold/50 shadow-[0_0_0_6px_rgba(197,164,109,0.08),0_20px_60px_-20px_rgba(0,0,0,0.9)]" : "ring-white/10"
        }`}
      >
        <img src={src} alt="Santa Claus" width={size} height={size} className="h-full w-full object-cover object-[50%_18%]" draggable={false} />
      </div>
    </div>
  );
}
