import { CallHistory } from "@/components/parent/CallHistory";
import { PageHeader } from "@/components/ui";
import { requireParentPage } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { childWhere } from "@/lib/parent-data";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const parent = await requireParentPage();
  const [family, calls] = await Promise.all([
    db.family.findUniqueOrThrow({ where: { id: parent.familyId }, select: { timezone: true } }),
    db.call.findMany({
      where: { child: childWhere(parent) },
      orderBy: { startedAt: "desc" },
      take: 200,
      include: { child: { select: { firstName: true, nickname: true } } },
    }),
  ]);
  return (
    <div>
      <PageHeader title="Call History" description="Calls are never recorded. You'll see when each call happened, how long it lasted, and a short summary for you to approve or edit." />
      <CallHistory
        timezone={family.timezone}
        calls={calls.map((c) => ({
          id: c.id,
          childName: c.child.nickname || c.child.firstName,
          startedAt: c.startedAt.toISOString(),
          durationSec: c.durationSec,
          status: c.status,
          endReason: c.endReason,
          summary: c.summary,
          summaryStatus: c.summaryStatus,
          safetyFlag: c.safetyFlag,
          safetyNote: c.safetyNote,
        }))}
      />
    </div>
  );
}
