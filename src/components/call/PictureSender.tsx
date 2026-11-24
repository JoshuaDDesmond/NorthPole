"use client";

import { Camera, Check, Loader2, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Status = "idle" | "captioning" | "sending" | "sent" | "error";

/** Shrinks a photo in the browser so it uploads quickly and never carries full-size originals. */
async function shrink(file: File, maxSide = 1280): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.85));
}

/**
 * "Send Santa a picture." Pick a photo, say what it is ("my Five Nights at Freddy's poster"),
 * and send. Before a call Santa hears about it next time; during one he reacts right away.
 */
export function PictureSender({ childId, callId, onSantaNote, compact }: { childId: string; callId?: string | null; onSantaNote?: (note: string) => void; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pick(f: File) {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setCaption("");
    setStatus("captioning");
  }

  function cancel() {
    setFile(null);
    setPreview(null);
    setStatus("idle");
  }

  async function send() {
    if (!file) return;
    setStatus("sending");
    setMessage("Sending it to the North Pole…");
    try {
      const body = await shrink(file);
      const qs = new URLSearchParams({ childId, ...(callId ? { callId } : {}), ...(caption.trim() ? { caption: caption.trim() } : {}) });
      const res = await fetch(`/api/family/photos?${qs}`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body });
      const data = (await res.json().catch(() => ({}))) as { santaNote?: string | null; error?: { message?: string } };
      if (!res.ok) throw new Error(data.error?.message ?? "That picture didn't make it. Try again?");
      if (data.santaNote) onSantaNote?.(data.santaNote);
      setFile(null);
      setPreview(null);
      setStatus("sent");
      setMessage(callId ? "Santa got your picture!" : "Sent! Santa will see it before your next call.");
      setTimeout(() => setStatus((s) => (s === "sent" ? "idle" : s)), 6000);
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error && e.message !== "encode" ? e.message : "That picture didn't make it. Try a different one?");
    }
  }

  if ((status === "captioning" || status === "sending") && preview) {
    return (
      <form
        className="flex w-full max-w-[300px] flex-col gap-2 rounded-2xl border border-gold/25 bg-gold/[0.05] p-3 animate-fade-in"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the picked photo */}
          <img src={preview} alt="The picture you picked" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
          <label className="flex-1 text-left">
            <span className="text-xs font-medium text-snow">What is it?</span>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={120}
              autoFocus
              placeholder="Like: my Five Nights at Freddy's poster"
              className="mt-1 w-full rounded-lg border border-line bg-black/20 px-2.5 py-1.5 text-sm text-snow placeholder:text-mist/60 focus:border-gold/50 focus:outline-none"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={cancel} disabled={status === "sending"} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-mist hover:text-snow">
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
          <button
            type="submit"
            disabled={status === "sending"}
            className="inline-flex items-center gap-1.5 rounded-full bg-gold px-3.5 py-1.5 text-xs font-medium text-ink transition hover:bg-gold-2 disabled:opacity-60"
          >
            {status === "sending" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {status === "sending" ? "Sending…" : "Send to Santa"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) pick(f);
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={`inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/[0.06] text-gold transition hover:bg-gold/[0.12] ${compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"}`}
      >
        {status === "sent" ? <Check className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
        Send Santa a picture
      </button>
      <p className="min-h-4 text-center text-[11px] text-mist" aria-live="polite">
        {status === "sent" || status === "error" ? message : ""}
      </p>
    </div>
  );
}
