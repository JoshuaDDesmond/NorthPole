"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Card, CardHeader, ErrorText, Field, Input, Textarea, Toggle, useToast } from "@/components/ui";

export type ChildFormValue = {
  firstName: string;
  nickname: string;
  age: number | null;
  birthday: string;
  parents: string;
  siblings: string;
  pets: string;
  school: string;
  sportsAndTeams: string;
  hobbies: string;
  favoriteActivities: string;
  accomplishments: string;
  challengesAndGoals: string;
  christmasWishes: string;
  traditions: string;
  otherDetails: string;
  customFields: { label: string; value: string }[];
  topicsToAvoid: string;
  nextCallInstructions: string;
  callingEnabled: boolean;
};

export const EMPTY_CHILD: ChildFormValue = {
  firstName: "",
  nickname: "",
  age: 13,
  birthday: "",
  parents: "",
  siblings: "",
  pets: "",
  school: "",
  sportsAndTeams: "",
  hobbies: "",
  favoriteActivities: "",
  accomplishments: "",
  challengesAndGoals: "",
  christmasWishes: "",
  traditions: "",
  otherDetails: "",
  customFields: [],
  topicsToAvoid: "",
  nextCallInstructions: "",
  callingEnabled: true,
};

type TextKey = Exclude<keyof ChildFormValue, "age" | "customFields" | "callingEnabled">;

const SECTIONS: { title: string; description: string; fields: { key: TextKey; label: string; placeholder?: string; multiline?: boolean; hint?: string }[] }[] = [
  {
    title: "Family & home",
    description: "Who's in their world.",
    fields: [
      { key: "parents", label: "Parents", placeholder: "Mom and Dad" },
      { key: "siblings", label: "Siblings", placeholder: "An older sister and a younger brother" },
      { key: "pets", label: "Pets", placeholder: "A golden retriever named Biscuit" },
      { key: "school", label: "School (optional)", placeholder: "8th grade", hint: "General is fine. Santa never needs an exact school name." },
    ],
  },
  {
    title: "Interests",
    description: "The things that light them up.",
    fields: [
      { key: "sportsAndTeams", label: "Favorite sports and teams", multiline: true },
      { key: "hobbies", label: "Hobbies and interests", multiline: true },
      { key: "favoriteActivities", label: "Favorite activities", multiline: true },
    ],
  },
  {
    title: "This year",
    description: "What's been happening lately.",
    fields: [
      { key: "accomplishments", label: "Recent accomplishments", multiline: true },
      { key: "challengesAndGoals", label: "Current challenges or goals", multiline: true, hint: "Santa will be encouraging, never preachy or guilt-tripping." },
      { key: "christmasWishes", label: "Christmas wishes", multiline: true, hint: "Santa can acknowledge wishes but will never promise a specific gift." },
      { key: "traditions", label: "Family holiday traditions", multiline: true },
      { key: "otherDetails", label: "Other details Santa should know", multiline: true },
    ],
  },
];

export function ChildProfileEditor({ childId, initial }: { childId?: string; initial: ChildFormValue }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState<ChildFormValue>(initial);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const update = <K extends keyof ChildFormValue>(k: K, val: ChildFormValue[K]) => {
    setV((s) => ({ ...s, [k]: val }));
    setDirty(true);
  };

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = { ...v, customFields: v.customFields.filter((f) => f.label.trim()) };
      if (childId) {
        await api(`/api/parent/children/${childId}`, { method: "PATCH", body });
        toast("Profile saved.");
        setDirty(false);
        router.refresh();
      } else {
        const res = await api<{ child: { id: string } }>("/api/parent/children", { body });
        toast(`${v.firstName} has been added.`);
        router.push(`/parent/children/${res.child.id}?tab=talking-points`);
        router.refresh();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!childId) return;
    if (!window.confirm(`Delete ${v.firstName}'s profile, talking points, memories and call history? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await api(`/api/parent/children/${childId}`, { method: "DELETE" });
      toast("Profile deleted.");
      router.push("/parent/children");
      router.refresh();
    } catch (err) {
      toast((err as Error).message, "error");
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <Card>
        <CardHeader title="The basics" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          <Field label="First name">
            <Input value={v.firstName} onChange={(e) => update("firstName", e.target.value)} required maxLength={60} />
          </Field>
          <Field label="What Santa calls them (optional)" hint="Only if they go by something other than their first name, like a nickname. Not a last name. Leave blank to use their first name.">
            <Input value={v.nickname} onChange={(e) => update("nickname", e.target.value)} maxLength={60} placeholder={v.firstName ? `Leave blank for "${v.firstName}"` : "e.g. Bear"} />
          </Field>
          <Field label="Age">
            <Input
              type="number"
              min={1}
              max={19}
              value={v.age ?? ""}
              onChange={(e) => update("age", e.target.value ? Math.max(1, Math.min(19, Number(e.target.value))) : null)}
            />
          </Field>
          <Field label="Birthday (optional)" hint="Month and day is plenty.">
            <Input value={v.birthday} onChange={(e) => update("birthday", e.target.value)} placeholder="March 4" maxLength={60} />
          </Field>
        </div>
      </Card>

      {SECTIONS.map((section) => (
        <Card key={section.title}>
          <CardHeader title={section.title} description={section.description} />
          <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-2">
            {section.fields.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint} className={f.multiline ? "md:col-span-2" : ""}>
                {f.multiline ? (
                  <Textarea value={v[f.key]} onChange={(e) => update(f.key, e.target.value)} placeholder={f.placeholder} maxLength={3000} />
                ) : (
                  <Input value={v[f.key]} onChange={(e) => update(f.key, e.target.value)} placeholder={f.placeholder} maxLength={500} />
                )}
              </Field>
            ))}
          </div>
        </Card>
      ))}

      <Card>
        <CardHeader title="Anything else" description="Add your own fields for details that don't fit above." />
        <div className="space-y-3 p-5 sm:p-6">
          {v.customFields.map((f, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[180px_1fr_auto]">
              <Input
                placeholder="Label (e.g. Best friend)"
                value={f.label}
                maxLength={60}
                onChange={(e) => update("customFields", v.customFields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <Input
                placeholder="Details"
                value={f.value}
                maxLength={1000}
                onChange={(e) => update("customFields", v.customFields.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
              />
              <Button type="button" variant="ghost" onClick={() => update("customFields", v.customFields.filter((_, j) => j !== i))} aria-label="Remove field">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {v.customFields.length < 20 && (
            <Button type="button" size="sm" onClick={() => update("customFields", [...v.customFields, { label: "", value: "" }])}>
              <Plus className="h-3.5 w-3.5" /> Add a field
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Guidance for Santa" description="Specific to this child. Family-wide guidance lives under Personality." />
        <div className="grid gap-4 p-5 sm:p-6">
          <Field label="Topics to avoid" hint="Santa won't bring these up, and will gently move on if they come up.">
            <Textarea value={v.topicsToAvoid} onChange={(e) => update("topicsToAvoid", e.target.value)} maxLength={1000} />
          </Field>
          <Field label="Instructions for the next call" hint="Used once, then cleared after a real conversation happens.">
            <Textarea
              value={v.nextCallInstructions}
              onChange={(e) => update("nextCallInstructions", e.target.value)}
              placeholder="Congratulate him on making the travel team."
              maxLength={1000}
            />
          </Field>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
            <div>
              <p className="text-sm font-medium text-snow">Can call Santa</p>
              <p className="text-xs text-mist">Pause this to hide them from the caller list.</p>
            </div>
            <Toggle checked={v.callingEnabled} onChange={(c) => update("callingEnabled", c)} label="Can call Santa" />
          </div>
        </div>
      </Card>

      <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-ink-2/95 px-4 py-3 shadow-2xl backdrop-blur lg:bottom-4">
        <div className="min-w-0">
          <ErrorText>{error}</ErrorText>
          {!error && <p className="text-xs text-mist">{dirty ? "You have unsaved changes." : childId ? "All changes saved." : "Fill in what you know. You can add more later."}</p>}
        </div>
        <div className="flex gap-2">
          {childId && (
            <Button type="button" variant="ghost" onClick={remove} loading={deleting}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          <Button type="submit" variant="gold" loading={saving} disabled={!v.firstName.trim()}>
            {childId ? "Save profile" : "Add child"}
          </Button>
        </div>
      </div>
    </form>
  );
}
