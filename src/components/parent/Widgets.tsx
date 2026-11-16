"use client";

import { AlertTriangle, CheckCircle2, Loader2, PhoneOff, RefreshCw, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Toggle, useToast } from "@/components/ui";

/** Emergency on/off switch for every call. Turning it off hangs up live calls immediately. */
export function CallingSwitch({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);
  async function change(v: boolean) {
    setBusy(true);
    try {
      await api("/api/parent/settings", { method: "PATCH", body: { callingEnabled: v } });
      setOn(v);
      toast(v ? "Santa's line is open." : "Calling is off. Any live call was ended.");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`flex items-center justify-between gap-4 rounded-2xl border p-5 ${on ? "border-call/25 bg-call/[0.06]" : "border-berry/40 bg-berry/[0.08]"}`}>
      <div>
        <p className="text-[15px] font-semibold text-snow">{on ? "Santa's line is open" : "Calling is turned off"}</p>
        <p className="mt-1 text-sm text-mist">
          {on ? "Turn this off any time to stop all calls instantly, including one in progress." : "No one can call Santa until you turn this back on."}
        </p>
      </div>
      <Toggle checked={on} onChange={change} label="Allow calls to Santa" disabled={busy} />
    </div>
  );
}

type VoiceStatus = { configured: boolean; ok: boolean; model: string; message: string };

export function VoiceStatusCard() {
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await api<VoiceStatus>("/api/parent/voice-status"));
    } catch (e) {
      setStatus({ configured: false, ok: false, model: "", message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
  }, [load]);

  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-mist" />
        ) : status?.ok ? (
          <CheckCircle2 className="h-5 w-5 text-call" />
        ) : status?.configured ? (
          <AlertTriangle className="h-5 w-5 text-gold" />
        ) : (
          <XCircle className="h-5 w-5 text-berry-2" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-snow">
          {loading ? "Checking voice service…" : status?.ok ? "Voice service connected" : status?.configured ? "Voice service needs attention" : "Voice service not connected"}
        </p>
        {!loading && status && (
          <p className="mt-0.5 text-xs leading-relaxed text-mist">
            {status.message}
            {status.model && <span className="text-mist/70"> · Model: {status.model}</span>}
          </p>
        )}
      </div>
      <button onClick={() => void load()} className="rounded-lg p-1.5 text-mist transition hover:bg-white/5 hover:text-snow" aria-label="Recheck voice service">
        <RefreshCw className="h-4 w-4" />
      </button>
    </div>
  );
}

export function HangUpButton({ callId }: { callId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="danger"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api(`/api/parent/calls/${callId}`, { method: "DELETE" });
          toast("The call was ended.");
          router.refresh();
        } catch (e) {
          toast((e as Error).message, "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <PhoneOff className="h-3.5 w-3.5" /> Hang up
    </Button>
  );
}

/** Owner-only: creates or refreshes Santa's ElevenLabs agent. */
export function ConnectElevenLabsButton({ connected }: { connected: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={connected ? "secondary" : "gold"}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api("/api/parent/elevenlabs/connect", { method: "POST" });
          toast(connected ? "Santa's agent settings were refreshed." : "Connected! Santa's ElevenLabs agent is ready.");
          router.refresh();
        } catch (e) {
          toast((e as Error).message, "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      {connected ? "Refresh ElevenLabs settings" : "Connect ElevenLabs"}
    </Button>
  );
}
