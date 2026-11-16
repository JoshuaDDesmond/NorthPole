import type { ReactNode } from "react";
import { DashboardShell } from "@/components/parent/DashboardShell";
import { requireParentPage } from "@/lib/auth/session";
import { sweepCalls } from "@/lib/calls/lifecycle";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ParentLayout({ children }: { children: ReactNode }) {
  const parent = await requireParentPage();
  await sweepCalls(parent.familyId);
  const [family, pending] = await Promise.all([
    db.family.findUniqueOrThrow({ where: { id: parent.familyId }, select: { name: true, callingEnabled: true } }),
    db.memory.count({ where: { status: "PROPOSED", child: { familyId: parent.familyId } } }),
  ]);
  return (
    <DashboardShell parentName={parent.name} familyName={family.name} pendingMemories={pending} callingEnabled={family.callingEnabled}>
      {children}
    </DashboardShell>
  );
}
