"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PhoneFrame } from "./PhoneFrame";

/** Pairs a device with the family using the code a parent sets. Kids never see parent credentials. */
export function FamilyAccess() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/family/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(data.error?.message ?? "That code didn't work.");
        return;
      }
      router.refresh();
    } catch {
      setError("We couldn't reach the North Pole. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PhoneFrame>
      <div className="np-safe flex flex-1 flex-col px-7">
        <header className="pt-2 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gold">North Pole Direct Line</p>
          <p className="mt-1.5 text-xs text-mist">A private connection to Santa&apos;s Workshop</p>
        </header>
        <form onSubmit={submit} className="flex flex-1 flex-col items-center justify-center gap-6 animate-fade-in">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-evergreen ring-1 ring-inset ring-line">
            <Lock className="h-7 w-7 text-gold" strokeWidth={1.6} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Connect this device</h1>
            <p className="mx-auto mt-2 max-w-[280px] text-sm leading-relaxed text-mist">
              Enter your parent&apos;s North Pole code. They can find it in Santa&apos;s Secret Book under Settings.
            </p>
          </div>
          <label className="w-full max-w-[300px]">
            <span className="sr-only">North Pole code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="North Pole code"
              className="w-full rounded-2xl border border-line bg-white/[0.04] px-5 py-4 text-center text-lg tracking-wider text-snow placeholder:text-mist/50 focus:border-gold/60 focus:outline-none"
            />
          </label>
          {error && (
            <p className="max-w-[300px] text-center text-sm text-[#e79a9e]" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="w-full max-w-[300px] rounded-2xl bg-snow py-3.5 text-[15px] font-semibold text-ink transition hover:bg-white disabled:opacity-40"
          >
            {busy ? "Checking…" : "Connect"}
          </button>
        </form>
        <p className="pb-2 text-center text-[11px] text-mist/60">
          Parents: <a href="/parent" className="underline decoration-mist/40 underline-offset-2 hover:text-snow">sign in here</a>
        </p>
      </div>
    </PhoneFrame>
  );
}
