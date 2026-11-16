import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChildProfileEditor, type ChildFormValue } from "@/components/parent/ChildProfileEditor";
import { ChildTabs } from "@/components/parent/ChildTabs";
import { ContextPreview } from "@/components/parent/ContextPreview";
import { MemoryReview } from "@/components/parent/MemoryReview";
import { TalkingPointsEditor } from "@/components/parent/TalkingPointsEditor";
import { Badge, PageHeader } from "@/components/ui";
import { requireParentPage } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { childWhere } from "@/lib/parent-data";
import { ChildManagers } from "@/components/parent/ChildManagers";

export const dynamic = "force-dynamic";

export default async function ChildPage({ params }: { params: Promise<{ id: string }> }) {
  const parent = await requireParentPage();
  const { id } = await params;
  const child = await db.child.findFirst({
    where: { id, ...childWhere(parent) },
    include: {
      talkingPoints: { orderBy: [{ enabled: "desc" }, { createdAt: "desc" }] },
      memories: { orderBy: { createdAt: "desc" } },
      access: { select: { parentUserId: true } },
    },
  });
  if (!child) notFound();
  const familyParents = parent.isOwner
    ? await db.parentUser.findMany({ where: { familyId: parent.familyId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, role: true } })
    : [];

  const customFields = Array.isArray(child.customFields)
    ? (child.customFields as { label?: unknown; value?: unknown }[]).map((f) => ({ label: String(f?.label ?? ""), value: String(f?.value ?? "") }))
    : [];
  const initial: ChildFormValue = {
    firstName: child.firstName,
    nickname: child.nickname,
    age: child.age,
    birthday: child.birthday,
    parents: child.parents,
    siblings: child.siblings,
    pets: child.pets,
    school: child.school,
    sportsAndTeams: child.sportsAndTeams,
    hobbies: child.hobbies,
    favoriteActivities: child.favoriteActivities,
    accomplishments: child.accomplishments,
    challengesAndGoals: child.challengesAndGoals,
    christmasWishes: child.christmasWishes,
    traditions: child.traditions,
    otherDetails: child.otherDetails,
    customFields,
    topicsToAvoid: child.topicsToAvoid,
    nextCallInstructions: child.nextCallInstructions,
    callingEnabled: child.callingEnabled,
  };
  const name = child.nickname || child.firstName;
  const pending = child.memories.filter((m) => m.status === "PROPOSED").length;

  return (
    <div>
      <Link href="/parent/children" className="mb-4 inline-flex items-center gap-1 text-sm text-mist hover:text-snow">
        <ChevronLeft className="h-4 w-4" /> Children
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {child.firstName}
            {!child.callingEnabled && <Badge tone="red">Calling paused</Badge>}
          </span>
        }
        description={`Everything Santa knows about ${name}. Parent-provided details are always treated as the source of truth.`}
      />
      <Suspense>
        <ChildTabs
          badges={{ memory: pending }}
          panels={{
            profile: (
              <div className="space-y-6">
                {parent.isOwner && (
                  <ChildManagers childId={child.id} childName={name} parents={familyParents} selected={child.access.map((a) => a.parentUserId)} />
                )}
                <ChildProfileEditor key={child.updatedAt.toISOString()} childId={child.id} initial={initial} />
              </div>
            ),
            "talking-points": (
              <TalkingPointsEditor
                childId={child.id}
                childName={name}
                points={child.talkingPoints.map((p) => ({
                  id: p.id,
                  topic: p.topic,
                  details: p.details,
                  priority: p.priority,
                  enabled: p.enabled,
                  expiresAt: p.expiresAt ? p.expiresAt.toISOString().slice(0, 10) : null,
                  lastDiscussedAt: p.lastDiscussedAt?.toISOString() ?? null,
                  timesDiscussed: p.timesDiscussed,
                }))}
              />
            ),
            memory: (
              <MemoryReview
                childId={child.id}
                childName={name}
                memories={child.memories.map((m) => ({ id: m.id, content: m.content, status: m.status, source: m.source, createdAt: m.createdAt.toISOString() }))}
              />
            ),
            preview: <ContextPreview childId={child.id} />,
          }}
        />
      </Suspense>
    </div>
  );
}
