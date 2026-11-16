import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { PhoneFrame } from "./PhoneFrame";
import { SantaContactPhoto } from "./SantaContactPhoto";

type Caller = { id: string; name: string };

const TINTS = ["bg-evergreen text-gold", "bg-berry/80 text-snow", "bg-[#2a3a44] text-gold-2", "bg-[#3b2f22] text-gold-2"];

export function CallerPicker({ callers, photoUrl }: { callers: Caller[]; photoUrl: string }) {
  return (
    <PhoneFrame>
      <div className="np-safe flex flex-1 flex-col px-6">
        <header className="pt-2 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gold">North Pole Direct Line</p>
          <p className="mt-1.5 text-xs text-mist">A private connection to Santa&apos;s Workshop</p>
        </header>
        <section className="flex flex-1 flex-col items-center justify-center gap-8 animate-fade-in">
          <SantaContactPhoto src={photoUrl} size={112} />
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Who&apos;s calling Santa?</h1>
            <p className="mt-1.5 text-sm text-mist">Santa likes to know who&apos;s on the line.</p>
          </div>
          {callers.length === 0 ? (
            <p className="max-w-[280px] text-center text-sm text-mist">No callers are set up yet. Ask a parent to add you in Santa&apos;s Secret Book.</p>
          ) : (
            <ul className="w-full max-w-[340px] overflow-hidden rounded-3xl border border-line bg-white/[0.03]">
              {callers.map((c, i) => (
                <li key={c.id} className="border-b border-line last:border-0">
                  <Link href={`/call/${c.id}`} className="flex items-center gap-4 px-4 py-3.5 transition hover:bg-white/[0.04] active:bg-white/[0.06]">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-full text-base font-semibold ${TINTS[i % TINTS.length]}`}>
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="flex-1 text-[17px] font-medium text-snow">{c.name}</span>
                    <ChevronRight className="h-5 w-5 text-mist/60" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PhoneFrame>
  );
}
