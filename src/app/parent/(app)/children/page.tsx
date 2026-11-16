import { ArrowRight, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireParentPage } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ChildrenPage() {
  const parent = await requireParentPage();
  const children = await db.child.findMany({
    where: { familyId: parent.familyId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      _count: {
        select: { talkingPoints: { where: { enabled: true } }, memories: { where: { status: "APPROVED" } } },
      },
      memories: { where: { status: "PROPOSED" }, select: { id: true } },
    },
  });

  return (
    <div>
      <PageHeader
        title="Children"
        description="Each child has their own profile, talking points and memories. Santa only ever sees the details for the child who's calling."
        action={
          <Link href="/parent/children/new" className="inline-flex h-10 items-center gap-2 rounded-xl bg-gold px-4 text-sm font-medium text-ink transition hover:bg-gold-2">
            <UserPlus className="h-4 w-4" /> Add child
          </Link>
        }
      />
      {children.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="No children yet"
            body="Add your first child so Santa knows who he's talking to."
            action={
              <Link href="/parent/children/new" className="inline-flex h-10 items-center gap-2 rounded-xl bg-gold px-4 text-sm font-medium text-ink">
                <UserPlus className="h-4 w-4" /> Add child
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {children.map((c) => (
            <Link key={c.id} href={`/parent/children/${c.id}`} className="group">
              <Card className="h-full p-5 transition group-hover:border-line-2 group-hover:bg-ink-2">
                <div className="flex items-center gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-evergreen text-lg font-semibold text-gold">{c.firstName.charAt(0)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-snow">
                      {c.firstName}
                      {c.nickname && <span className="font-normal text-mist"> “{c.nickname}”</span>}
                    </p>
                    <p className="text-sm text-mist">{c.age ? `Age ${c.age}` : "Age not set"}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-mist transition group-hover:translate-x-0.5 group-hover:text-snow" />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge>{c._count.talkingPoints} talking points</Badge>
                  <Badge>{c._count.memories} memories</Badge>
                  {c.memories.length > 0 && <Badge tone="gold">{c.memories.length} to review</Badge>}
                  {!c.callingEnabled && <Badge tone="red">Calling paused</Badge>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
