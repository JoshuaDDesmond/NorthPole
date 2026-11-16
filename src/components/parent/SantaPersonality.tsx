"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { ELEVEN_LLMS, REALTIME_VOICES } from "@/lib/santa/voices";
import { ElevenVoicePicker } from "./ElevenVoicePicker";
import { Button, Card, CardHeader, ErrorText, Field, Input, LevelPicker, Textarea, useToast } from "@/components/ui";

export type PersonalityValue = {
  voice: string;
  customVoiceId: string;
  humor: number;
  energy: number;
  northPoleReferences: number;
  conversationLength: "SHORT" | "MEDIUM" | "LONG";
  speakingPace: number;
  elevenVoiceId: string;
  elevenLlm: string;
  topicsToAvoid: string;
  nextCallInstructions: string;
};

export const PERSONALITY_DEFAULTS: Omit<PersonalityValue, "topicsToAvoid" | "nextCallInstructions" | "customVoiceId" | "elevenVoiceId"> = {
  elevenLlm: "gemini-2.5-flash",
  voice: "ash",
  speakingPace: 0.9,
  humor: 3,
  energy: 3,
  northPoleReferences: 3,
  conversationLength: "MEDIUM",
};

export function SantaPersonalityEditor({ initial, provider, defaultElevenVoiceId }: { initial: PersonalityValue; provider: "openai" | "elevenlabs"; defaultElevenVoiceId: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof PersonalityValue>(k: K, val: PersonalityValue[K]) => setV((s) => ({ ...s, [k]: val }));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api("/api/parent/personality", {
        method: "PATCH",
        body: { ...v, customVoiceId: v.customVoiceId.trim() || null, elevenVoiceId: v.elevenVoiceId.trim() || null },
      });
      toast("Santa's personality saved. It applies from the next call.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {provider === "elevenlabs" && (
        <Card>
          <CardHeader
            title="Santa's voice (ElevenLabs)"
            description={`Pick from the voices in your ElevenLabs account, or paste any voice ID from their Voice Library.${defaultElevenVoiceId ? " Leave it on the default to use the voice set in Vercel." : ""}`}
          />
          <div className="space-y-5 p-5 sm:p-6">
            <ElevenVoicePicker value={v.elevenVoiceId} defaultVoiceId={defaultElevenVoiceId} onChange={(id) => set("elevenVoiceId", id)} />
            <Field label="Conversation model" hint="The model that decides what Santa says. All are hosted by ElevenLabs; no extra keys needed.">
              <div className="grid gap-2 sm:grid-cols-2">
                {ELEVEN_LLMS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => set("elevenLlm", m.id)}
                    aria-pressed={v.elevenLlm === m.id}
                    className={`rounded-xl border px-4 py-3 text-left transition ${v.elevenLlm === m.id ? "border-gold/60 bg-gold/10" : "border-line hover:bg-white/[0.03]"}`}
                  >
                    <p className="text-sm font-medium text-snow">{m.label}</p>
                    <p className="mt-0.5 text-xs text-mist">{m.note}</p>
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </Card>
      )}

      <Card className={provider === "elevenlabs" ? "hidden" : ""}>
        <CardHeader
          title="Voice"
          description="Voices offered by the realtime voice service. Ash sounds the oldest; Santa is also told to speak deep, slow and grandfatherly whichever you pick. Make a test call after changing it."
        />
        <div className="grid gap-2 p-5 sm:grid-cols-2 sm:p-6">
          {REALTIME_VOICES.map((voice) => (
            <button
              key={voice.id}
              type="button"
              onClick={() => set("voice", voice.id)}
              className={`rounded-xl border px-4 py-3 text-left transition ${
                v.voice === voice.id && !v.customVoiceId.trim() ? "border-gold/60 bg-gold/10" : "border-line hover:border-line-2 hover:bg-white/[0.03]"
              }`}
              aria-pressed={v.voice === voice.id}
            >
              <p className="text-sm font-medium text-snow">{voice.label}</p>
              <p className="mt-0.5 text-xs text-mist">{voice.note}</p>
            </button>
          ))}
          <Field
            label="Custom voice ID (advanced, optional)"
            className="mt-3 sm:col-span-2"
            hint="Only if your OpenAI organization has been granted a custom voice. Leave blank to use the voice selected above."
          >
            <Input value={v.customVoiceId} onChange={(e) => set("customVoiceId", e.target.value)} placeholder="voice_..." maxLength={120} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Personality" description="Defaults are tuned for a warm, natural conversation with a 13-year-old." />
        <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-3">
          <Field label="Humor">
            <LevelPicker name="Humor" value={v.humor} onChange={(n) => set("humor", n)} labels={["Gentle", "Jokester"]} />
          </Field>
          <Field label="Conversation energy">
            <LevelPicker name="Energy" value={v.energy} onChange={(n) => set("energy", n)} labels={["Calm", "Lively"]} />
          </Field>
          <Field label="North Pole references">
            <LevelPicker name="North Pole references" value={v.northPoleReferences} onChange={(n) => set("northPoleReferences", n)} labels={["Rare", "Plenty"]} />
          </Field>
          <Field label="Speaking pace" className="md:col-span-3" hint="A slightly slower pace sounds older and calmer.">
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  [0.82, "Slow", "Very unhurried"],
                  [0.9, "Relaxed", "Recommended"],
                  [1, "Natural", "Normal speed"],
                ] as const
              ).map(([pace, label, sub]) => (
                <button
                  key={pace}
                  type="button"
                  onClick={() => set("speakingPace", pace)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition ${Math.abs(v.speakingPace - pace) < 0.01 ? "border-gold/60 bg-gold/10" : "border-line hover:bg-white/[0.03]"}`}
                >
                  <p className="text-sm font-medium text-snow">{label}</p>
                  <p className="text-xs text-mist">{sub}</p>
                </button>
              ))}
            </div>
          </Field>
          <Field label="Preferred conversation length" className="md:col-span-3">
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["SHORT", "Short", "3 to 5 min"],
                  ["MEDIUM", "Medium", "5 to 8 min"],
                  ["LONG", "Long", "No rush"],
                ] as const
              ).map(([id, label, sub]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => set("conversationLength", id)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition ${v.conversationLength === id ? "border-gold/60 bg-gold/10" : "border-line hover:bg-white/[0.03]"}`}
                >
                  <p className="text-sm font-medium text-snow">{label}</p>
                  <p className="text-xs text-mist">{sub}</p>
                </button>
              ))}
            </div>
            <span className="mt-1.5 block text-xs text-mist/80">The hard limit is set under Settings › Maximum call length.</span>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Family-wide guidance" description="Applies to every child. Each child's page also has their own topics to avoid and next-call notes." />
        <div className="grid gap-4 p-5 sm:p-6">
          <Field label="Topics to avoid">
            <Textarea value={v.topicsToAvoid} onChange={(e) => set("topicsToAvoid", e.target.value)} placeholder="Grandpa's health, the move next summer" maxLength={1500} />
          </Field>
          <Field label="Instructions for the next call" hint="Used for the next real conversation, then cleared automatically.">
            <Textarea value={v.nextCallInstructions} onChange={(e) => set("nextCallInstructions", e.target.value)} placeholder="Mention that the reindeer have been practicing extra hard this week." maxLength={1500} />
          </Field>
        </div>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={() => setV((s) => ({ ...s, ...PERSONALITY_DEFAULTS, customVoiceId: "" }))}>
          Restore defaults
        </Button>
        <div className="flex items-center gap-3">
          <ErrorText>{error}</ErrorText>
          <Button variant="gold" onClick={save} loading={saving}>
            Save personality
          </Button>
        </div>
      </div>
    </div>
  );
}
