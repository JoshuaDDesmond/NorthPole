import { MemoryReview } from "@/components/parent/MemoryReview";
import { PageHeader } from "@/components/ui";
import { requireParentPage } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { childWhere } from "@/lib/parent-data";

export const dynamic = "force-dynamic";

export default async function MemoriesPage() {
  const parent = await requireParentPage();
  const memories = await db.memory.findMany({
    where: { child: childWhere(parent) },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { child: { select: { firstName: true, nickname: true } } },
    take: 300,
  });
  return (
    <div>
      <PageHeader
        title="Santa's Memory"
        description="After each call, Santa may suggest a few short facts worth remembering. They stay here, unused, until you approve them. No audio or full transcripts are ever saved."
      />
      <MemoryReview
        showChild
        memories={memories.map((m) => ({
          id: m.id,
          content: m.content,
          status: m.status,
          source: m.source,
          createdAt: m.createdAt.toISOString(),
          childName: m.child.nickname || m.child.firstName,
        }))}
      />
      <p className="mt-6 text-xs text-mist">To add a memory yourself or clear memories for one child, open that child&apos;s page under Children.</p>
    </div>
  );
}
