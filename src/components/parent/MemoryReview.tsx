"use client";

import { Check, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Badge, Button, Card, CardHeader, EmptyState, Input, useToast } from "@/components/ui";

export type MemoryView = {
  id: string;
  content: string;
  status: "PROPOSED" | "APPROVED";
  source: "CALL" | "PARENT";
  createdAt: string;
  childName?: string;
};

function MemoryRow({ m, showChild }: { m: MemoryView; showChild: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.content);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try {
      await fn();
      toast(msg);
      setEditing(false);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  const approve = () => run(() => api(`/api/parent/memories/${m.id}`, { method: "PATCH", body: { status: "APPROVED", content: text } }), "Approved. Santa will remember this.");
  const save = () => run(() => api(`/api/parent/memories/${m.id}`, { method: "PATCH", body: { content: text } }), "Memory updated.");
  const remove = () => run(() => api(`/api/parent/memories/${m.id}`, { method: "DELETE" }), m.status === "PROPOSED" ? "Rejected and deleted." : "Memory deleted.");

  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
      <div className="min-w-0 flex-1">
        {editing ? (
          <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={400} autoFocus />
        ) : (
          <p className="text-sm leading-relaxed text-snow">{m.content}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-mist">
          {showChild && m.childName && <Badge tone="gold">{m.childName}</Badge>}
          <span>{m.source === "PARENT" ? "Added by a parent" : "From a call"}</span>
          <span>·</span>
          <span>{new Date(m.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {editing ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => (setEditing(false), setText(m.content))}>
              Cancel
            </Button>
            {m.status === "PROPOSED" ? (
              <Button size="sm" variant="gold" onClick={approve} loading={busy} disabled={!text.trim()}>
                <Check className="h-3.5 w-3.5" /> Save & approve
              </Button>
            ) : (
              <Button size="sm" variant="gold" onClick={save} loading={busy} disabled={!text.trim()}>
                Save
              </Button>
            )}
          </>
        ) : (
          <>
            {m.status === "PROPOSED" && (
              <Button size="sm" variant="gold" onClick={approve} loading={busy}>
                <Check className="h-3.5 w-3.5" /> Approve
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={remove} disabled={busy} aria-label={m.status === "PROPOSED" ? "Reject" : "Delete"}>
              {m.status === "PROPOSED" ? <X className="h-4 w-4" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

export function MemoryReview({ memories, childId, childName, showChild = false }: { memories: MemoryView[]; childId?: string; childName?: string; showChild?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [newMemory, setNewMemory] = useState("");
  const [busy, setBusy] = useState(false);
  const proposed = memories.filter((m) => m.status === "PROPOSED");
  const approved = memories.filter((m) => m.status === "APPROVED");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!childId || !newMemory.trim()) return;
    setBusy(true);
    try {
      await api(`/api/parent/children/${childId}/memories`, { body: { content: newMemory } });
      setNewMemory("");
      toast("Memory added.");
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (!childId) return;
    if (!window.confirm(`Clear every saved and proposed memory for ${childName}? This can't be undone.`)) return;
    try {
      await api(`/api/parent/children/${childId}/memories`, { method: "DELETE" });
      toast("All memories cleared.");
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  return (
    <div className="space-y-6">
      <Card className={proposed.length ? "border-gold/30" : ""}>
        <CardHeader title={`Waiting for your review${proposed.length ? ` (${proposed.length})` : ""}`} description="Facts Santa picked up on recent calls. Nothing here is used until you approve it." />
        {proposed.length === 0 ? (
          <EmptyState icon={<Sparkles className="h-5 w-5" />} title="You're all caught up" body="After a call, any new details worth remembering will show up here for you to approve, edit or reject." />
        ) : (
          <ul className="divide-y divide-line">
            {proposed.map((m) => (
              <MemoryRow key={m.id} m={m} showChild={showChild} />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="What Santa remembers"
          description="Approved memories Santa can draw on in future calls."
          action={
            childId &&
            memories.length > 0 && (
              <Button size="sm" variant="ghost" onClick={clearAll}>
                <Trash2 className="h-3.5 w-3.5" /> Clear all
              </Button>
            )
          }
        />
        {childId && (
          <form onSubmit={add} className="flex gap-2 border-b border-line px-5 py-4 sm:px-6">
            <Input value={newMemory} onChange={(e) => setNewMemory(e.target.value)} placeholder="Add a memory yourself, e.g. Lost a front tooth at practice" maxLength={400} />
            <Button type="submit" variant="secondary" loading={busy} disabled={!newMemory.trim()}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </form>
        )}
        {approved.length === 0 ? (
          <p className="px-6 py-8 text-sm text-mist">No approved memories yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {approved.map((m) => (
              <MemoryRow key={m.id} m={m} showChild={showChild} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
