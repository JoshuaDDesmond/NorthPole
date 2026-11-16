"use client";

import { AlertTriangle, Check, PhoneIncoming, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { formatDuration } from "@/lib/time";
import { Badge, Button, Card, EmptyState, Textarea, useToast } from "@/components/ui";

export type CallView = {
  id: string;
  childName: string;
  startedAt: string;
  durationSec: number;
  status: string;
  endReason: string | null;
  summary: string | null;
  summaryStatus: "NONE" | "PROPOSED" | "APPROVED";
  safetyFlag: boolean;
  safetyNote: string | null;
};

const STATUS: Record<string, { label: string; tone: "green" | "red" | "neutral" | "gold" }> = {
  COMPLETED: { label: "Completed", tone: "green" },
  LIMIT_REACHED: { label: "Time limit reached", tone: "gold" },
  DISCONNECTED: { label: "Dropped", tone: "neutral" },
  FAILED: { label: "Didn't connect", tone: "red" },
  ENDED_BY_PARENT: { label: "Ended by parent", tone: "neutral" },
  ACTIVE: { label: "Live now", tone: "green" },
  CONNECTING: { label: "Connecting", tone: "neutral" },
};

const FAIL_REASONS: Record<string, string> = {
  voice_not_configured: "Voice service not configured",
  voice_auth_failed: "Voice service key rejected",
  voice_busy: "Voice service busy",
  voice_rejected: "Voice settings rejected",
  voice_unreachable: "Voice service unreachable",
  connect_timeout: "Connection timed out",
  cancelled: "Hung up before connecting",
  error: "Connection error",
};

function CallRow({ c, timezone }: { c: CallView; timezone: string }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(c.summary ?? "");
  const [busy, setBusy] = useState(false);
  const status = STATUS[c.status] ?? { label: c.status, tone: "neutral" as const };

  async function patch(body: Record<string, unknown>, msg: string) {
    setBusy(true);
    try {
      await api(`/api/parent/calls/${c.id}`, { method: "PATCH", body });
      toast(msg);
      setEditing(false);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!window.confirm("Delete this call from the history?")) return;
    try {
      await api(`/api/parent/calls/${c.id}`, { method: "DELETE" });
      toast("Call deleted.");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const when = new Date(c.startedAt);
  return (
    <li className="px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <PhoneIncoming className="h-4 w-4 text-mist" />
        <p className="text-sm font-medium text-snow">{c.childName}</p>
        <p className="text-sm text-mist">
          {when.toLocaleDateString("en-US", { timeZone: timezone, weekday: "short", month: "short", day: "numeric" })} ·{" "}
          {when.toLocaleTimeString("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" })}
        </p>
        <span className="text-sm tabular-nums text-mist">{formatDuration(c.durationSec)}</span>
        <Badge tone={status.tone}>{status.label}</Badge>
        {c.status === "FAILED" && c.endReason && FAIL_REASONS[c.endReason] && <span className="text-xs text-mist">{FAIL_REASONS[c.endReason]}</span>}
        <div className="ml-auto flex items-center gap-1">
          {c.summary && !editing && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label="Edit summary">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {c.status !== "ACTIVE" && c.status !== "CONNECTING" && (
            <Button size="sm" variant="ghost" onClick={remove} aria-label="Delete call">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {c.safetyFlag && (
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-gold/40 bg-gold/[0.07] px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-snow">Worth a check-in</p>
            <p className="mt-0.5 text-mist">{c.safetyNote}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => patch({ clearSafetyFlag: true }, "Marked as reviewed.")}>
            Dismiss
          </Button>
        </div>
      )}

      {c.summary && (
        <div className="mt-3 rounded-xl border border-line bg-white/[0.02] px-4 py-3">
          {editing ? (
            <div className="space-y-2">
              <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={1000} />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => (setEditing(false), setSummary(c.summary ?? ""))}>
                  Cancel
                </Button>
                <Button size="sm" variant="gold" loading={busy} onClick={() => patch({ summary, approve: true }, "Summary saved.")}>
                  Save & approve
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <p className="flex-1 text-sm leading-relaxed text-snow/90">{c.summary}</p>
              {c.summaryStatus === "PROPOSED" ? (
                <Button size="sm" variant="secondary" loading={busy} onClick={() => patch({ approve: true }, "Summary approved.")}>
                  <Check className="h-3.5 w-3.5" /> Approve summary
                </Button>
              ) : (
                <Badge tone="green">Approved</Badge>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function CallHistory({ calls, timezone }: { calls: CallView[]; timezone: string }) {
  if (calls.length === 0) {
    return (
      <Card>
        <EmptyState icon={<PhoneIncoming className="h-5 w-5" />} title="No calls yet" body="When someone calls Santa, the date, length and a short summary for you will appear here." />
      </Card>
    );
  }
  return (
    <Card>
      <ul className="divide-y divide-line">
        {calls.map((c) => (
          <CallRow key={c.id} c={c} timezone={timezone} />
        ))}
      </ul>
    </Card>
  );
}
