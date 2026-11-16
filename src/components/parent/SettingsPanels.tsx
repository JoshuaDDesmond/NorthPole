"use client";

/* eslint-disable @next/next/no-img-element -- authenticated photo route */
import { ImageUp, KeyRound, Laptop, RotateCcw, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { Badge, Button, Card, CardHeader, ErrorText, Field, Input, Select, Toggle, useToast } from "@/components/ui";
import { TimezoneSelect } from "./AuthForms";

/* ------------------------------ Contact photo ------------------------------ */

async function resizeImage(file: File, max = 800): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process that image."))), "image/jpeg", 0.88));
}

export function PhotoPanel({ photoUrl, hasCustom }: { photoUrl: string; hasCustom: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    try {
      if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
      const blob = await resizeImage(file);
      const form = new FormData();
      form.set("photo", blob, "santa.jpg");
      await api("/api/parent/photo", { form });
      setPreview(URL.createObjectURL(blob));
      toast("Santa's contact photo updated.");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    try {
      await api("/api/parent/photo", { method: "DELETE" });
      setPreview(null);
      toast("Restored the default photo.");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Santa's contact photo" description="Shown on the call screen. It always stays perfectly still." />
      <div className="flex flex-col items-center gap-5 p-5 sm:flex-row sm:p-6">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-full ring-1 ring-gold/40">
          <img src={preview ?? photoUrl} alt="Santa contact" className="h-full w-full object-cover object-[50%_18%]" />
        </div>
        <div className="flex flex-1 flex-col items-center gap-3 sm:items-start">
          <p className="text-center text-sm text-mist sm:text-left">Use a JPEG, PNG or WebP. A portrait with Santa&apos;s face near the top works best. It&apos;s resized automatically.</p>
          <div className="flex gap-2">
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
            <Button variant="gold" onClick={() => input.current?.click()} loading={busy}>
              <ImageUp className="h-4 w-4" /> Upload photo
            </Button>
            {hasCustom && (
              <Button variant="ghost" onClick={reset} disabled={busy}>
                <RotateCcw className="h-4 w-4" /> Use default
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------ Family access ------------------------------ */

type Device = { id: string; label: string; createdAt: string; lastSeenAt: string };

export function FamilyAccessPanel({ hasCode, devices }: { hasCode: boolean; devices: Device[] }) {
  const router = useRouter();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveCode(e: React.FormEvent) {
    e.preventDefault();
    if (hasCode && !window.confirm("Changing the code disconnects every device that's currently connected. Continue?")) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/parent/access-code", { body: { code } });
      setCode("");
      toast("Family access code saved.");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    try {
      await api(`/api/parent/devices/${id}`, { method: "DELETE" });
      toast("Device disconnected.");
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  return (
    <Card>
      <div id="access" className="scroll-mt-24" />
      <CardHeader
        title="Family access"
        description="Kids connect a phone or tablet once with this code. They never need your password, and can't open this dashboard."
        action={hasCode ? <Badge tone="green">Code set</Badge> : <Badge tone="red">No code yet</Badge>}
      />
      <form onSubmit={saveCode} className="flex flex-col gap-3 border-b border-line p-5 sm:flex-row sm:items-end sm:p-6">
        <Field label={hasCode ? "Change family code" : "Create a family code"} hint="At least 6 characters. Something easy for the kids to type, like a fun phrase." className="flex-1">
          <Input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" minLength={6} maxLength={100} placeholder="reindeer-games" />
        </Field>
        <Button type="submit" variant="gold" loading={busy} disabled={code.trim().length < 6} className="sm:mb-[22px]">
          <KeyRound className="h-4 w-4" /> Save code
        </Button>
      </form>
      <ErrorText>{error}</ErrorText>
      <div className="p-5 sm:p-6">
        <p className="mb-3 text-[13px] font-medium text-snow/90">Connected devices</p>
        {devices.length === 0 ? (
          <p className="text-sm text-mist">No devices connected yet. Open this site on your child&apos;s device and enter the code.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <Laptop className="h-4 w-4 text-mist" />
                <div className="flex-1">
                  <p className="text-sm text-snow">{d.label}</p>
                  <p className="text-xs text-mist">Last used {new Date(d.lastSeenAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void revoke(d.id)}>
                  Disconnect
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/* ---------------------------- Calling preferences --------------------------- */

export type FamilySettingsValue = {
  name: string;
  timezone: string;
  maxCallMinutes: number;
  dailyMinutesPerChild: number;
  generateMemoryProposals: boolean;
  ambientSound: boolean;
};

export function CallingPreferencesPanel({ initial }: { initial: FamilySettingsValue }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof FamilySettingsValue>(k: K, val: FamilySettingsValue[K]) => setV((s) => ({ ...s, [k]: val }));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/parent/settings", { method: "PATCH", body: v });
      toast("Settings saved.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Calls & limits" description="Limits are enforced on the server, not just in the browser." />
      <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
        <Field label="Family name">
          <Input value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={80} />
        </Field>
        <Field label="Time zone" hint="Used for Santa's sense of time and for daily limits.">
          <TimezoneSelect value={v.timezone} onChange={(tz) => set("timezone", tz)} />
        </Field>
        <Field label="Maximum call length" hint="Santa wraps up warmly as time runs out.">
          <Select value={v.maxCallMinutes} onChange={(e) => set("maxCallMinutes", Number(e.target.value))}>
            {[3, 5, 8, 10, 12, 15, 20, 30].map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Daily usage limit (per child)" hint="Total minutes each child can talk to Santa per day.">
          <Select value={v.dailyMinutesPerChild} onChange={(e) => set("dailyMinutesPerChild", Number(e.target.value))}>
            {[5, 10, 15, 20, 30, 45, 60, 90].map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-start justify-between gap-4 rounded-xl border border-line px-4 py-3 sm:col-span-2">
          <div>
            <p className="text-sm font-medium text-snow">Suggest memories after calls</p>
            <p className="mt-0.5 text-xs leading-relaxed text-mist">
              After a call, a short summary and a few suggested memories are prepared for your review. The conversation text is used once for this and never saved. Turn off to skip it
              entirely.
            </p>
          </div>
          <Toggle checked={v.generateMemoryProposals} onChange={(c) => set("generateMemoryProposals", c)} label="Suggest memories after calls" />
        </div>
        <div className="flex items-start justify-between gap-4 rounded-xl border border-line px-4 py-3 sm:col-span-2">
          <div>
            <p className="text-sm font-medium text-snow">Workshop ambience</p>
            <p className="mt-0.5 text-xs text-mist">A very quiet, warm room tone with a faint fireplace crackle during calls. Off by default.</p>
          </div>
          <Toggle checked={v.ambientSound} onChange={(c) => set("ambientSound", c)} label="Workshop ambience" />
        </div>
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-4 sm:px-6">
        <ErrorText>{error}</ErrorText>
        <Button variant="gold" onClick={save} loading={busy}>
          Save
        </Button>
      </div>
    </Card>
  );
}

/* ---------------------------------- Consent --------------------------------- */

export function ConsentPanel({ consentAt }: { consentAt: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [checked, setChecked] = useState(Boolean(consentAt));
  const [busy, setBusy] = useState(false);
  async function save(v: boolean) {
    setBusy(true);
    try {
      await api("/api/parent/settings", { method: "PATCH", body: { parentConsent: v } });
      setChecked(v);
      toast(v ? "Thanks. Calls are enabled." : "Consent withdrawn. Calls are paused until you confirm again.");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <div id="consent" className="scroll-mt-24" />
      <CardHeader title="Parent consent" description="Required before the first call." action={consentAt ? <Badge tone="green">Confirmed</Badge> : <Badge tone="red">Needed</Badge>} />
      <div className="space-y-3 p-5 text-sm leading-relaxed text-mist sm:p-6">
        <p>Before your children use Santa&apos;s line, please confirm that:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>You are the parent or legal guardian of each child you add, and each child is at least 13.</li>
          <li>You understand Santa is an AI voice powered by OpenAI. Your child&apos;s voice and the profile details you add for them are sent to OpenAI to run each call.</li>
          <li>Calls are not recorded. A short summary and suggested memories may be generated for your review (you can turn this off).</li>
          <li>You&apos;ll supervise use, and you can review, edit or delete your child&apos;s information at any time.</li>
        </ul>
        <label className="mt-4 flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-snow">
          <ShieldCheck className="h-5 w-5 text-gold" />
          <span className="flex-1 text-sm">I&apos;m the parent or guardian and I agree to the above.</span>
          <Toggle checked={checked} onChange={(v) => void save(v)} label="Parent consent" disabled={busy} />
        </label>
        {consentAt && <p className="text-xs">Confirmed on {new Date(consentAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.</p>}
      </div>
    </Card>
  );
}

/* ------------------------------ Parent accounts ----------------------------- */

type ParentRow = { id: string; name: string; email: string; lastLoginAt: string | null };

export function ParentAccountsPanel({ parents, currentUserId }: { parents: ParentRow[]; currentUserId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy("add");
    setError(null);
    try {
      await api("/api/parent/parents", { body: form });
      toast(`${form.name} can now sign in.`);
      setForm({ name: "", email: "", password: "" });
      setAdding(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(p: ParentRow) {
    if (!window.confirm(`Remove ${p.name}'s access?`)) return;
    try {
      await api(`/api/parent/parents/${p.id}`, { method: "DELETE" });
      toast("Access removed.");
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy("pw");
    try {
      await api("/api/parent/password", { body: pw });
      setPw({ currentPassword: "", newPassword: "" });
      toast("Password updated.");
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Parent accounts"
        description="Everyone here can manage Santa's Secret Book."
        action={
          !adding && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <UserPlus className="h-3.5 w-3.5" /> Add parent
            </Button>
          )
        }
      />
      {adding && (
        <form onSubmit={add} className="grid gap-3 border-b border-line bg-white/[0.02] p-5 sm:grid-cols-3 sm:p-6">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={80} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </Field>
          <Field label="Temporary password">
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={10} required autoComplete="new-password" />
          </Field>
          <div className="flex items-center justify-end gap-2 sm:col-span-3">
            <ErrorText>{error}</ErrorText>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="gold" loading={busy === "add"}>
              Add parent
            </Button>
          </div>
        </form>
      )}
      <ul className="divide-y divide-line">
        {parents.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-evergreen text-xs font-semibold text-gold">{p.name.charAt(0)}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-snow">
                {p.name} {p.id === currentUserId && <span className="text-mist">(you)</span>}
              </p>
              <p className="truncate text-xs text-mist">{p.email}</p>
            </div>
            {p.id !== currentUserId && (
              <Button size="sm" variant="ghost" onClick={() => void remove(p)} aria-label={`Remove ${p.name}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={changePassword} className="grid gap-3 border-t border-line p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-6">
        <Field label="Current password">
          <Input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" required />
        </Field>
        <Field label="New password">
          <Input type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} minLength={10} autoComplete="new-password" required />
        </Field>
        <Button type="submit" loading={busy === "pw"}>
          Change password
        </Button>
      </form>
    </Card>
  );
}

/* ------------------------------- Data deletion ------------------------------ */

const SCOPES = [
  { id: "call_history", label: "Call history", body: "Dates, durations and summaries of past calls." },
  { id: "memories", label: "All memories", body: "Every approved and proposed memory, for all children." },
  { id: "all_child_data", label: "All children's data", body: "Every child profile, talking point, memory and call. Calling is turned off." },
  { id: "everything", label: "Everything", body: "The whole family account, parents included. You'll be signed out." },
] as const;

export function DataDeletionPanel() {
  const router = useRouter();
  const toast = useToast();
  const [scope, setScope] = useState<(typeof SCOPES)[number]["id"] | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!scope) return;
    setBusy(true);
    try {
      const res = await api<{ signedOut?: boolean }>("/api/parent/data", { body: { scope, confirm } });
      toast("Deleted.");
      setScope(null);
      setConfirm("");
      if (res.signedOut) {
        router.replace("/parent/setup");
        router.refresh();
      }
      else router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-berry/30">

      <CardHeader title="Delete data" description="Permanent and immediate. There's no undo." />
      <div className="grid gap-2 p-5 sm:grid-cols-2 sm:p-6">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => (setScope(s.id), setConfirm(""))}
            className={`rounded-xl border px-4 py-3 text-left transition ${scope === s.id ? "border-berry/60 bg-berry/10" : "border-line hover:bg-white/[0.03]"}`}
          >
            <p className="text-sm font-medium text-snow">{s.label}</p>
            <p className="mt-0.5 text-xs text-mist">{s.body}</p>
          </button>
        ))}
      </div>
      {scope && (
        <div className="flex flex-col gap-3 border-t border-line p-5 sm:flex-row sm:items-end sm:p-6">
          <Field label={`Type DELETE to remove ${SCOPES.find((s) => s.id === scope)!.label.toLowerCase()}`} className="flex-1">
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" placeholder="DELETE" />
          </Field>
          <Button variant="danger" disabled={confirm !== "DELETE"} loading={busy} onClick={run}>
            <Trash2 className="h-4 w-4" /> Delete permanently
          </Button>
        </div>
      )}
    </Card>
  );
}
