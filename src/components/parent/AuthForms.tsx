"use client";

import { BookOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api } from "@/lib/client/api";
import { Button, ErrorText, Field, Input, Select } from "@/components/ui";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="np-backdrop flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-[420px] animate-fade-in">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-evergreen ring-1 ring-inset ring-line">
            <BookOpen className="h-6 w-6 text-gold" strokeWidth={1.6} />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gold">Santa&apos;s Secret Book</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-mist">{subtitle}</p>
        </div>
        <div className="rounded-3xl border border-line bg-ink-2/80 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] sm:p-7">{children}</div>
        {footer && <div className="mt-6 text-center text-xs text-mist">{footer}</div>}
      </div>
    </main>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/parent/auth/login", { body: { email, password } });
      router.replace("/parent");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email">
        <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Password">
        <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" variant="primary" className="w-full" loading={busy}>
        Sign in
      </Button>
    </form>
  );
}

const COMMON_TZ = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Australia/Sydney",
];

export function TimezoneSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options = COMMON_TZ.includes(value) ? COMMON_TZ : [value, ...COMMON_TZ];
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((tz) => (
        <option key={tz} value={tz}>
          {tz.replace(/_/g, " ")}
        </option>
      ))}
    </Select>
  );
}

export function SetupForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    setupToken: "",
    familyName: "",
    name: "",
    email: "",
    password: "",
    timezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "America/New_York",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/parent/auth/setup", { body: form });
      router.replace("/parent");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Setup token" hint="The SETUP_TOKEN value from your server's environment settings. It's only needed once.">
        <Input type="password" value={form.setupToken} onChange={set("setupToken")} required autoComplete="off" />
      </Field>
      <Field label="Family name">
        <Input value={form.familyName} onChange={set("familyName")} placeholder="e.g. The Winters Family" required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name">
          <Input value={form.name} onChange={set("name")} required autoComplete="name" />
        </Field>
        <Field label="Time zone">
          <TimezoneSelect value={form.timezone} onChange={(timezone) => setForm((f) => ({ ...f, timezone }))} />
        </Field>
      </div>
      <Field label="Email">
        <Input type="email" value={form.email} onChange={set("email")} required autoComplete="username" />
      </Field>
      <Field label="Password" hint="At least 10 characters.">
        <Input type="password" value={form.password} onChange={set("password")} required minLength={10} autoComplete="new-password" />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" variant="primary" className="w-full" loading={busy}>
        Create parent account
      </Button>
    </form>
  );
}
