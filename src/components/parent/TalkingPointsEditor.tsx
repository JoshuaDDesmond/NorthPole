"use client";

import { MessageSquareText, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorText, Field, Input, Select, Textarea, Toggle, useToast } from "@/components/ui";

export type TalkingPointView = {
  id: string;
  topic: string;
  details: string;
  priority: "HIGH" | "NORMAL" | "LOW";
  expiresAt: string | null; // YYYY-MM-DD
  enabled: boolean;
  lastDiscussedAt: string | null;
  timesDiscussed: number;
};

type Draft = { topic: string; details: string; priority: "HIGH" | "NORMAL" | "LOW"; expiresAt: string; enabled: boolean };
const EMPTY: Draft = { topic: "", details: "", priority: "NORMAL", expiresAt: "", enabled: true };

function PointForm({ initial, onCancel, onSave, saving, error }: { initial: Draft; onCancel?: () => void; onSave: (d: Draft) => void; saving: boolean; error: string | null }) {
  const [d, setD] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(d);
      }}
      className="grid gap-4 md:grid-cols-[1fr_160px_170px]"
    >
      <Field label="Topic">
        <Input value={d.topic} onChange={(e) => setD({ ...d, topic: e.target.value })} placeholder="Football" maxLength={120} required />
      </Field>
      <Field label="Priority">
        <Select value={d.priority} onChange={(e) => setD({ ...d, priority: e.target.value as Draft["priority"] })}>
          <option value="HIGH">High</option>
          <option value="NORMAL">Normal</option>
          <option value="LOW">Low</option>
        </Select>
      </Field>
      <Field label="Expires (optional)">
        <Input type="date" value={d.expiresAt} onChange={(e) => setD({ ...d, expiresAt: e.target.value })} />
      </Field>
      <Field label="Details" className="md:col-span-3" hint="Write it the way you'd brief a friend. Santa will bring it up naturally, never read it out.">
        <Textarea
          value={d.details}
          onChange={(e) => setD({ ...d, details: e.target.value })}
          placeholder="He recently finished football season. Ask how the season went and whether he's excited for next year."
          maxLength={1500}
          required
        />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-3">
        <label className="flex items-center gap-3 text-sm text-mist">
          <Toggle checked={d.enabled} onChange={(v) => setD({ ...d, enabled: v })} label="Enabled" />
          {d.enabled ? "Enabled" : "Disabled"}
        </label>
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

export function TalkingPointsEditor({ childId, childName, points }: { childId: string; childName: string; points: TalkingPointView[] }) {
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(points.length === 0);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  async function create(d: Draft) {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/parent/children/${childId}/talking-points`, { body: { ...d, expiresAt: d.expiresAt || null } });
      toast("Talking point added.");
      setAdding(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: string, body: Partial<Omit<Draft, "expiresAt">> & { expiresAt?: string | null }, message = "Saved.") {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/parent/talking-points/${id}`, { method: "PATCH", body });
      toast(message);
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this talking point?")) return;
    try {
      await api(`/api/parent/talking-points/${id}`, { method: "DELETE" });
      toast("Deleted.");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <Card>
      <CardHeader
        title="Santa's talking points"
        description={`Things you'd like Santa to bring up with ${childName}. He'll weave in one or two per call.`}
        action={
          !adding && (
            <Button size="sm" variant="gold" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          )
        }
      />
      {adding && (
        <div className="border-b border-line bg-white/[0.02] p-5 sm:p-6">
          <PointForm initial={EMPTY} onSave={create} onCancel={points.length ? () => setAdding(false) : undefined} saving={saving} error={error} />
        </div>
      )}
      {points.length === 0 && !adding ? (
        <EmptyState icon={<MessageSquareText className="h-5 w-5" />} title="No talking points yet" body="Add a topic like a recent game, a school play, or a new puppy." />
      ) : (
        <ul className="divide-y divide-line">
          {points.map((p) => {
            const expired = p.expiresAt && p.expiresAt < today;
            if (editing === p.id) {
              return (
                <li key={p.id} className="bg-white/[0.02] p-5 sm:p-6">
                  <PointForm
                    initial={{ topic: p.topic, details: p.details, priority: p.priority, expiresAt: p.expiresAt ?? "", enabled: p.enabled }}
                    onSave={(d) => patch(p.id, { ...d, expiresAt: d.expiresAt || null })}
                    onCancel={() => setEditing(null)}
                    saving={saving}
                    error={error}
                  />
                </li>
              );
            }
            return (
              <li key={p.id} className={`flex gap-4 px-5 py-4 sm:px-6 ${!p.enabled || expired ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-snow">{p.topic}</p>
                    <Badge tone={p.priority === "HIGH" ? "gold" : "neutral"}>{p.priority === "HIGH" ? "High" : p.priority === "LOW" ? "Low" : "Normal"}</Badge>
                    {expired && <Badge tone="red">Expired</Badge>}
                    {!expired && p.expiresAt && <Badge>Until {new Date(p.expiresAt + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Badge>}
                    {p.timesDiscussed > 0 && <Badge tone="green">Discussed {p.timesDiscussed}×</Badge>}
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-mist">{p.details}</p>
                </div>
                <div className="flex shrink-0 items-start gap-1">
                  <Toggle checked={p.enabled} onChange={(v) => void patch(p.id, { enabled: v }, v ? "Enabled." : "Disabled.")} label={`Enable ${p.topic}`} />
                  <Button size="sm" variant="ghost" onClick={() => setEditing(p.id)} aria-label="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void remove(p.id)} aria-label="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
