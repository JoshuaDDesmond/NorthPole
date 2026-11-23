"use client";

import { Home } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Card, CardHeader, Textarea, useToast } from "@/components/ui";

/** A parent's shared household facts. Santa knows them on calls from every child this parent manages. */
export function HouseholdNotes({ initial, childNames }: { initial: string; childNames: string[] }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function save() {
    setBusy(true);
    try {
      await api("/api/parent/me", { method: "PATCH", body: { householdNotes: value } });
      setSaved(value);
      toast("Household notes saved. Santa will know these on the next call.");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Home className="h-4 w-4 text-gold" /> Household notes for Santa
          </span>
        }
        description={
          childNames.length
            ? `Things Santa should know about your home, shared on calls from ${childNames.join(", ")}.`
            : "Things Santa should know about your home. Once you manage a child, Santa knows these on their calls."
        }
      />
      <div className="space-y-3 p-5 sm:p-6">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder={"Our scout elf is named Scout. He's been visiting since 2021 and likes hiding in the Christmas tree.\nOur dog is Pepper. We go to Grandma's on Christmas Eve."}
          aria-label="Household notes for Santa"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-mist">{value.length}/2000 · Scout elf, pets, family traditions, nicknames for people at home.</p>
          <Button onClick={() => void save()} loading={busy} disabled={busy || value === saved}>
            Save
          </Button>
        </div>
      </div>
    </Card>
  );
}
