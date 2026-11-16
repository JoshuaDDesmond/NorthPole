"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "talking-points", label: "Talking Points" },
  { id: "memory", label: "Memory" },
  { id: "preview", label: "Preview" },
] as const;

export function ChildTabs({ panels, badges }: { panels: Record<(typeof TABS)[number]["id"], ReactNode>; badges?: Partial<Record<string, number>> }) {
  const router = useRouter();
  const params = useSearchParams();
  const current = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "profile") as (typeof TABS)[number]["id"];
  return (
    <div>
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-line bg-ink-2/60 p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={current === t.id}
            onClick={() => router.replace(`?tab=${t.id}`, { scroll: false })}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
              current === t.id ? "bg-white/[0.09] text-snow" : "text-mist hover:text-snow"
            }`}
          >
            {t.label}
            {badges?.[t.id] ? <span className="rounded-full bg-gold px-1.5 text-[11px] font-semibold text-ink">{badges[t.id]}</span> : null}
          </button>
        ))}
      </div>
      <div role="tabpanel">{panels[current]}</div>
    </div>
  );
}
