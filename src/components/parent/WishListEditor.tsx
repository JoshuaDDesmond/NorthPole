"use client";

import { Check, ExternalLink, Eye, EyeOff, Gift, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorText, Field, Input, Toggle, useToast } from "@/components/ui";

export type WishView = {
  id: string;
  title: string;
  details: string;
  link: string | null;
  notes: string;
  topWish: boolean;
  purchased: boolean;
  santaCanMention: boolean;
  approved: boolean;
  source: "PARENT" | "CALL";
  createdAt: string;
};

type Draft = { title: string; details: string; link: string; notes: string; topWish: boolean; santaCanMention: boolean };
const EMPTY: Draft = { title: "", details: "", link: "", notes: "", topWish: false, santaCanMention: true };

function hostOf(link: string) {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return link;
  }
}

function WishForm({ initial, onSave, onCancel, saving, error }: { initial: Draft; onSave: (d: Draft) => void; onCancel?: () => void; saving: boolean; error: string | null }) {
  const [d, setD] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(d);
      }}
      className="grid gap-4 md:grid-cols-2"
    >
      <Field label="Wish">
        <Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Bauer Vapor hockey skates" maxLength={160} required />
      </Field>
      <Field label="Details Santa can mention" hint="Size, color, model. Santa uses these to show he remembers exactly.">
        <Input value={d.details} onChange={(e) => setD({ ...d, details: e.target.value })} placeholder="Size 8, black" maxLength={500} />
      </Field>
      <Field label="Link (parents only)" hint="Santa never sees links.">
        <Input type="url" inputMode="url" value={d.link} onChange={(e) => setD({ ...d, link: e.target.value })} placeholder="https://..." maxLength={2000} />
      </Field>
      <Field label="Private notes (parents only)" hint="Price, where to buy, who's getting it.">
        <Input value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="Grandma is getting this one" maxLength={1000} />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2">
        <div className="flex flex-wrap items-center gap-5 text-sm text-mist">
          <label className="flex items-center gap-2.5">
            <Toggle checked={d.topWish} onChange={(v) => setD({ ...d, topWish: v })} label="Top wish" /> Top wish
          </label>
          <label className="flex items-center gap-2.5">
            <Toggle checked={d.santaCanMention} onChange={(v) => setD({ ...d, santaCanMention: v })} label="Santa can mention" /> Santa can mention
          </label>
        </div>
        <div className="flex items-center gap-2">
          <ErrorText>{error}</ErrorText>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" variant="gold" loading={saving}>
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}

export function WishListEditor({ childId, childName, wishes, compact = false }: { childId: string; childName: string; wishes: WishView[]; compact?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(!compact && wishes.length === 0);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const heard = wishes.filter((w) => !w.approved);
  const list = wishes.filter((w) => w.approved);
  const toGet = list.filter((w) => !w.purchased).length;

  async function run(fn: () => Promise<unknown>, msg: string) {
    setSaving(true);
    setError(null);
    try {
      await fn();
      if (msg) toast(msg);
      setAdding(false);
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }
  const create = (d: Draft) => run(() => api(`/api/parent/children/${childId}/wishes`, { body: { ...d, link: d.link || null } }), "Added to the wish list.");
  const patch = (id: string, body: Record<string, unknown>, msg = "") => run(() => api(`/api/parent/wishes/${id}`, { method: "PATCH", body }), msg);
  const remove = (id: string, msg = "Removed.") => run(() => api(`/api/parent/wishes/${id}`, { method: "DELETE" }), msg);

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-gold" /> {compact ? childName : `${childName}'s wish list`}
            {list.length > 0 && (
              <span className="text-xs font-normal text-mist">
                {list.length} wish{list.length === 1 ? "" : "es"}
                {toGet !== list.length ? ` · ${list.length - toGet} got` : ""}
              </span>
            )}
          </span>
        }
        description={compact ? undefined : "Santa remembers these and never promises anything. Links, notes and what you've bought stay between the parents."}
        action={
          !adding && (
            <Button size="sm" variant="gold" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" /> Add wish
            </Button>
          )
        }
      />

      {heard.length > 0 && (
        <div className="border-b border-line bg-gold/[0.06] px-5 py-4 sm:px-6">
          <p className="mb-2 text-xs font-medium text-gold">Heard on a call: keep these on the list?</p>
          <ul className="space-y-2">
            {heard.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-gold/25 bg-ink/40 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-snow">{w.title}</p>
                  {w.details && <p className="text-xs text-mist">{w.details}</p>}
                </div>
                <Button size="sm" variant="gold" disabled={saving} onClick={() => void patch(w.id, { approved: true }, "Kept on the list.")}>
                  <Check className="h-3.5 w-3.5" /> Keep
                </Button>
                <Button size="sm" variant="ghost" disabled={saving} onClick={() => void remove(w.id, "Removed.")} aria-label="Remove">
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {adding && (
        <div className="border-b border-line bg-white/[0.02] p-5 sm:p-6">
          <WishForm initial={EMPTY} onSave={create} onCancel={() => setAdding(false)} saving={saving} error={error} />
        </div>
      )}

      {list.length === 0 && !adding ? (
        compact ? (
          <p className="px-6 py-5 text-sm text-mist">Nothing on the list yet.</p>
        ) : (
          <EmptyState
            icon={<Gift className="h-5 w-5" />}
            title="No wishes yet"
            body={`Add what ${childName} is hoping for, or let Santa ask. Anything ${childName} tells Santa on a call shows up here for you to keep.`}
          />
        )
      ) : (
        <ul className="divide-y divide-line">
          {list.map((w) =>
            editing === w.id ? (
              <li key={w.id} className="bg-white/[0.02] p-5 sm:p-6">
                <WishForm
                  initial={{ title: w.title, details: w.details, link: w.link ?? "", notes: w.notes, topWish: w.topWish, santaCanMention: w.santaCanMention }}
                  onSave={(d) => void patch(w.id, { ...d, link: d.link || null }, "Saved.")}
                  onCancel={() => setEditing(null)}
                  saving={saving}
                  error={error}
                />
              </li>
            ) : (
              <li key={w.id} className="flex gap-3 px-5 py-3.5 sm:px-6">
                <button
                  type="button"
                  onClick={() => void patch(w.id, { topWish: !w.topWish })}
                  aria-label={w.topWish ? "Unmark top wish" : "Mark as top wish"}
                  aria-pressed={w.topWish}
                  className={`mt-0.5 shrink-0 rounded-md p-1 transition ${w.topWish ? "text-gold" : "text-mist/40 hover:text-mist"}`}
                >
                  <Star className="h-4 w-4" fill={w.topWish ? "currentColor" : "none"} />
                </button>
                <div className={`min-w-0 flex-1 ${w.purchased ? "opacity-60" : ""}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`text-sm font-medium text-snow ${w.purchased ? "line-through decoration-mist/60" : ""}`}>{w.title}</p>
                    {w.details && <span className="text-sm text-mist">{w.details}</span>}
                    {w.source === "CALL" && <Badge>Told Santa</Badge>}
                    {!w.santaCanMention && <Badge tone="red">Hidden from Santa</Badge>}
                  </div>
                  {(w.link || w.notes) && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mist">
                      {w.link && (
                        <a href={w.link} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-gold hover:text-gold-2">
                          <ExternalLink className="h-3 w-3" /> {hostOf(w.link)}
                        </a>
                      )}
                      {w.notes && <span>{w.notes}</span>}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-start gap-1">
                  <button
                    type="button"
                    onClick={() => void patch(w.id, { purchased: !w.purchased }, w.purchased ? "" : "Marked as got it.")}
                    aria-pressed={w.purchased}
                    className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition ${
                      w.purchased ? "bg-call/15 text-[#8fe0ae]" : "text-mist ring-1 ring-inset ring-line hover:bg-white/[0.05]"
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" /> {w.purchased ? "Got it" : "Got it?"}
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void patch(w.id, { santaCanMention: !w.santaCanMention }, w.santaCanMention ? "Hidden from Santa." : "Santa can mention it.")}
                    aria-label={w.santaCanMention ? "Hide from Santa" : "Let Santa mention it"}
                  >
                    {w.santaCanMention ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(w.id)} aria-label="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => window.confirm(`Remove "${w.title}"?`) && void remove(w.id)} aria-label="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </Card>
  );
}
