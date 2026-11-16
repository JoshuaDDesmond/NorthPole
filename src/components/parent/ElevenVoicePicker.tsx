"use client";

import { Check, Loader2, Pause, Play, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { ErrorText, Field, Input } from "@/components/ui";

type Voice = { voiceId: string; name: string; description: string; previewUrl: string | null; category: string };

/** Lists voices from the family's ElevenLabs account, with previews, plus a paste-an-ID field. */
export function ElevenVoicePicker({ value, defaultVoiceId, onChange }: { value: string; defaultVoiceId: string | null; onChange: (id: string) => void }) {
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api<{ voices: Voice[] }>(`/api/parent/elevenlabs/voices${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""}`);
        setVoices(res.voices);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => () => audio.current?.pause(), []);

  function preview(v: Voice) {
    if (!v.previewUrl) return;
    if (playing === v.voiceId) {
      audio.current?.pause();
      setPlaying(null);
      return;
    }
    audio.current?.pause();
    const a = new Audio(v.previewUrl);
    audio.current = a;
    a.onended = () => setPlaying(null);
    void a.play().catch(() => setPlaying(null));
    setPlaying(v.voiceId);
  }

  const active = value.trim() || defaultVoiceId || "";

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist/60" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your voices (e.g. old, deep, Santa)" className="pl-9" />
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="max-h-80 overflow-y-auto rounded-xl border border-line">
        {loading && !voices ? (
          <div className="flex items-center gap-2 p-4 text-sm text-mist">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading voices…
          </div>
        ) : voices && voices.length === 0 ? (
          <p className="p-4 text-sm text-mist">No voices found. Add one to your account from the ElevenLabs Voice Library, or paste its ID below.</p>
        ) : (
          <ul className="divide-y divide-line">
            {(voices ?? []).map((v) => {
              const selected = active === v.voiceId;
              return (
                <li key={v.voiceId} className={`flex items-center gap-3 px-3.5 py-2.5 ${selected ? "bg-gold/10" : ""}`}>
                  <button
                    type="button"
                    onClick={() => preview(v)}
                    disabled={!v.previewUrl}
                    aria-label={`Preview ${v.name}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-snow transition hover:bg-white/[0.12] disabled:opacity-30"
                  >
                    {playing === v.voiceId ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </button>
                  <button type="button" onClick={() => onChange(v.voiceId)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm text-snow">
                      {v.name}
                      {defaultVoiceId === v.voiceId && <span className="text-xs text-mist"> · default</span>}
                    </p>
                    {v.description && <p className="truncate text-xs text-mist">{v.description}</p>}
                  </button>
                  {selected && <Check className="h-4 w-4 shrink-0 text-gold" />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Field label="Voice ID" hint={defaultVoiceId ? `Leave blank to use the default (${defaultVoiceId}).` : "Paste any ElevenLabs voice ID, or pick one above."}>
        <Input value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder={defaultVoiceId ?? "Voice ID from ElevenLabs"} maxLength={64} />
      </Field>
    </div>
  );
}
