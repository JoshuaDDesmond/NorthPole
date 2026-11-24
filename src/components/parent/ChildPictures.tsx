"use client";

import { AlertTriangle, ImageIcon, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Badge, Button, Card, CardHeader, EmptyState, useToast } from "@/components/ui";

export type PictureView = { id: string; createdAt: string; caption: string; description: string; safetyFlag: boolean; safetyNote: string | null; mentioned: boolean; duringCall: boolean };

/** Pictures a child sent to Santa: what Santa was told about each, and a way to remove them. */
export function ChildPictures({ childName, pictures, timezone }: { childName: string; pictures: PictureView[]; timezone: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(id: string) {
    if (!window.confirm("Delete this picture? Santa won't bring it up again.")) return;
    setBusy(id);
    try {
      await api(`/api/parent/photos/${id}`, { method: "DELETE" });
      toast("Picture deleted.");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Pictures sent to Santa"
        description={`${childName} can send Santa a picture from the call screen. Santa reacts right away during a call, or brings it up on the next one. Anything that looks like it needs a grown-up is held back from Santa and flagged here.`}
      />
      {pictures.length === 0 ? (
        <EmptyState icon={<ImageIcon className="h-5 w-5" />} title="No pictures yet" body={`When ${childName} sends Santa a picture, it shows up here.`} />
      ) : (
        <ul className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          {pictures.map((p) => {
            const when = new Date(p.createdAt);
            return (
              <li key={p.id} className="overflow-hidden rounded-xl border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated image */}
                <img src={`/api/parent/photos/${p.id}`} alt={p.description || "A picture sent to Santa"} className="aspect-[4/3] w-full bg-white/5 object-cover" loading="lazy" />
                <div className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-mist">
                      {when.toLocaleDateString("en-US", { timeZone: timezone, month: "short", day: "numeric" })} ·{" "}
                      {when.toLocaleTimeString("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" })}
                    </span>
                    {p.safetyFlag ? (
                      <Badge tone="red">Held back from Santa</Badge>
                    ) : p.duringCall ? (
                      <Badge tone="green">Santa saw it live</Badge>
                    ) : p.mentioned ? (
                      <Badge>Santa has seen it</Badge>
                    ) : (
                      <Badge tone="gold">Santa sees it next call</Badge>
                    )}
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void remove(p.id)} loading={busy === p.id} aria-label="Delete picture">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {p.safetyFlag && p.safetyNote && (
                    <p className="flex items-start gap-1.5 text-xs text-[#ef9ea3]">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {p.safetyNote}
                    </p>
                  )}
                  {p.caption && <p className="text-sm text-snow">&ldquo;{p.caption}&rdquo;</p>}
                  {p.description && <p className="text-xs leading-relaxed text-mist">What Santa was told: {p.description}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
