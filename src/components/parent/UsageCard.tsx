"use client";

import { ExternalLink, Loader2, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { formatDuration } from "@/lib/time";
import { Card, CardHeader } from "@/components/ui";

type ChildUsage = { childId: string; name: string; monthSeconds: number; monthCalls: number; weekSeconds: number };
export type UsageSummary = {
  monthLabel: string;
  weeklyLimitMinutes: number;
  totalMonthSeconds: number;
  totalMonthCalls: number;
  perChild: ChildUsage[];
};
type Subscription =
  | { ok: true; tier: string; status: string; creditsUsed: number; creditsLimit: number; resetsAt: string | null; currency: string; overage: string | null; nextInvoice: string | null }
  | { ok: false; message: string };

const minutes = (s: number) => (s < 60 ? `${s}s` : `${Math.round(s / 60)} min`);

/** Owner-only: exact call minutes from the app plus live plan usage from ElevenLabs. */
export function UsageCard({ usage }: { usage: UsageSummary }) {
  const [plan, setPlan] = useState<{ provider: string; subscription?: Subscription } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ provider: string; subscription?: Subscription }>("/api/parent/usage")
      .then(setPlan)
      .catch((e) => setPlan({ provider: "elevenlabs", subscription: { ok: false, message: (e as Error).message } }))
      .finally(() => setLoading(false));
  }, []);

  const sub = plan?.subscription;
  const pct = sub && sub.ok && sub.creditsLimit > 0 ? Math.min(100, Math.round((sub.creditsUsed / sub.creditsLimit) * 100)) : null;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-gold" /> Usage &amp; spending
          </span>
        }
        description="Only you (the owner) can see this."
      />
      <div className="space-y-5 p-5 sm:p-6">
        {/* Live plan usage */}
        {plan?.provider !== "openai" && (
          <div className="rounded-xl border border-line bg-white/[0.02] p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-mist">ElevenLabs plan</p>
            {loading ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-mist">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking your plan…
              </p>
            ) : sub && sub.ok ? (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm text-snow">
                    <span className="text-lg font-semibold tabular-nums">{sub.creditsUsed.toLocaleString()}</span>
                    <span className="text-mist"> of {sub.creditsLimit.toLocaleString()} credits used</span>
                  </p>
                  <p className="text-xs capitalize text-mist">{sub.tier.replace(/_/g, " ")} plan</p>
                </div>
                {pct !== null && (
                  <div className="h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className={`h-full rounded-full ${pct >= 90 ? "bg-berry-2" : pct >= 70 ? "bg-gold" : "bg-call"}`} style={{ width: `${pct}%` }} />
                  </div>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-mist">
                  {sub.resetsAt && <span>Resets {new Date(sub.resetsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                  {sub.nextInvoice && <span>Next invoice: {sub.nextInvoice}</span>}
                  {sub.overage && <span className="text-[#ef9ea3]">Overage so far: {sub.overage}</span>}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-mist">{sub?.message ?? "Plan usage isn't available."}</p>
            )}
            <a href="https://elevenlabs.io/app/subscription" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-gold hover:text-gold-2">
              Full billing in ElevenLabs <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        {/* Exact call minutes */}
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-snow">
              <span className="text-lg font-semibold tabular-nums">{minutes(usage.totalMonthSeconds)}</span>
              <span className="text-mist">
                {" "}
                of calls in {usage.monthLabel} · {usage.totalMonthCalls} call{usage.totalMonthCalls === 1 ? "" : "s"}
              </span>
            </p>
            <p className="text-xs text-mist">Weekly limit: {usage.weeklyLimitMinutes} min per child</p>
          </div>
          {usage.perChild.length > 0 && (
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
              {usage.perChild.map((c) => {
                const weekPct = Math.min(100, Math.round((c.weekSeconds / (usage.weeklyLimitMinutes * 60)) * 100));
                return (
                  <li key={c.childId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-24 shrink-0 truncate text-snow">{c.name}</span>
                    <div className="flex-1">
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/10" title={`This week: ${formatDuration(c.weekSeconds)}`}>
                        <div className={`h-full rounded-full ${weekPct >= 100 ? "bg-berry-2" : "bg-gold"}`} style={{ width: `${weekPct}%` }} />
                      </div>
                      <p className="mt-1 text-[11px] text-mist">
                        This week {formatDuration(c.weekSeconds)} of {usage.weeklyLimitMinutes}:00
                      </p>
                    </div>
                    <span className="w-28 shrink-0 text-right text-xs tabular-nums text-mist">
                      {minutes(c.monthSeconds)} this month
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <p className="text-[11px] leading-relaxed text-mist/80">
          Post-call summaries use OpenAI and cost pennies per call. See exact OpenAI spend at{" "}
          <a href="https://platform.openai.com/usage" target="_blank" rel="noopener noreferrer" className="text-gold hover:text-gold-2">
            platform.openai.com/usage
          </a>
          .
        </p>
      </div>
    </Card>
  );
}
