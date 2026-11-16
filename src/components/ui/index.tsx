"use client";

import { Loader2 } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

/* ---------------------------------- Button --------------------------------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "gold";
  size?: "sm" | "md";
  loading?: boolean;
};

export function Button({ variant = "secondary", size = "md", loading, className = "", children, disabled, ...rest }: ButtonProps) {
  const v = {
    primary: "bg-snow text-ink hover:bg-white",
    gold: "bg-gold text-ink hover:bg-gold-2",
    secondary: "bg-white/[0.06] text-snow ring-1 ring-inset ring-line hover:bg-white/[0.1]",
    ghost: "text-mist hover:bg-white/[0.06] hover:text-snow",
    danger: "bg-berry/90 text-white hover:bg-berry-2",
  }[variant];
  const s = size === "sm" ? "h-8 px-3 text-xs gap-1.5" : "h-10 px-4 text-sm gap-2";
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${v} ${s} ${className}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ----------------------------------- Card ---------------------------------- */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-ink-2/70 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.8)] ${className}`}>{children}</div>;
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-snow">{title}</h2>
        {description && <p className="mt-1 text-sm text-mist">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-snow sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-mist">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------------------------------- Fields --------------------------------- */

const inputCls =
  "w-full rounded-xl border border-line bg-ink/60 px-3.5 py-2.5 text-snow placeholder:text-mist/40 transition focus:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/15";

export function Field({ label, hint, children, className = "" }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[13px] font-medium text-snow/90">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-mist/80">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`${inputCls} min-h-[84px] resize-y leading-relaxed ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} appearance-none ${props.className ?? ""}`} />;
}

/* ---------------------------------- Toggle --------------------------------- */

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-call" : "bg-white/15"}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}

/* --------------------------------- Levels --------------------------------- */

export function LevelPicker({ value, onChange, labels, name }: { value: number; onChange: (v: number) => void; labels: [string, string]; name: string }) {
  return (
    <div>
      <div className="flex gap-1.5" role="radiogroup" aria-label={name}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n)}
            className={`h-9 flex-1 rounded-lg text-sm font-medium transition ${
              value === n ? "bg-gold text-ink" : n < value ? "bg-gold/25 text-snow" : "bg-white/[0.05] text-mist hover:bg-white/[0.09]"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-mist/70">
        <span>{labels[0]}</span>
        <span>{labels[1]}</span>
      </div>
    </div>
  );
}

/* ---------------------------------- Badge ---------------------------------- */

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "red" | "gold" }) {
  const t = {
    neutral: "bg-white/[0.07] text-mist",
    green: "bg-call/15 text-[#7fdca3]",
    red: "bg-berry/20 text-[#ef9ea3]",
    gold: "bg-gold/15 text-gold-2",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${t}`}>{children}</span>;
}

/* ------------------------------- Empty state ------------------------------- */

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-evergreen/70 text-gold">{icon}</div>}
      <p className="text-[15px] font-medium text-snow">{title}</p>
      {body && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-mist">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="text-sm text-[#ef9ea3]" role="alert">
      {children}
    </p>
  );
}

/* ---------------------------------- Toasts --------------------------------- */

type Toast = { id: number; message: string; tone: "ok" | "error" };
const ToastCtx = createContext<(message: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[max(env(safe-area-inset-bottom),1rem)] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl border px-4 py-2.5 text-sm shadow-xl backdrop-blur animate-fade-in ${
              t.tone === "ok" ? "border-line bg-ink-3/95 text-snow" : "border-berry/40 bg-[#2a1416]/95 text-[#f3b9bc]"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
