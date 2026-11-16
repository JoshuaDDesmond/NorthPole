"use client";

import { Check, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Badge, Button, Card, CardHeader, useToast } from "@/components/ui";

type ParentOption = { id: string; name: string; role: "OWNER" | "PARENT" };

/** Owner-only: choose which parents manage this child (see and edit them, and call from their devices). */
export function ChildManagers({ childId, childName, parents, selected }: { childId: string; childName: string; parents: ParentOption[]; selected: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [ids, setIds] = useState<string[]>(selected);
  const [busy, setBusy] = useState(false);
  const dirty = ids.length !== selected.length || ids.some((id) => !selected.includes(id));

  async function save() {
    setBusy(true);
    try {
      await api(`/api/parent/children/${childId}`, { method: "PATCH", body: { parentIds: ids } });
      toast("Access updated.");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4 text-gold" /> Who manages {childName}
          </span>
        }
        description={`These parents can see and edit ${childName}'s details, and ${childName} appears on devices paired with their code. As the owner, you can always see every child.`}
        action={
          dirty && (
            <Button size="sm" variant="gold" onClick={save} loading={busy}>
              Save access
            </Button>
          )
        }
      />
      <div className="flex flex-wrap gap-2 p-5 sm:p-6">
        {parents.map((p) => {
          const on = ids.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => setIds((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))}
              className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition ${
                on ? "border-gold/60 bg-gold/10 text-snow" : "border-line text-mist hover:bg-white/[0.04]"
              }`}
            >
              {on ? <Check className="h-3.5 w-3.5 text-gold" /> : <span className="h-3.5 w-3.5 rounded-full border border-mist/40" />}
              {p.name}
              {p.role === "OWNER" && <Badge tone="gold">Owner</Badge>}
            </button>
          );
        })}
        {ids.length === 0 && <p className="w-full text-xs text-[#ef9ea3]">No one manages {childName} yet, so they won&apos;t appear on any device.</p>}
      </div>
    </Card>
  );
}
