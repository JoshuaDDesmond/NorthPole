import type { ReactNode } from "react";
import { DashboardShell } from "@/components/parent/DashboardShell";
import { requireParentPage } from "@/lib/auth/session";
import { sweepCalls } from "@/lib/calls/lifecycle";
import { db } from "@/lib/db";
import { childWhere } from "@/lib/parent-data";
import { ForcePasswordChange } from "@/components/parent/AuthForms";

export const dynamic = "force-dynamic";

export default async function ParentLayout({ children }: { children: ReactNode }) {
  const parent = await requireParentPage();
  if (parent.mustChangePassword) return <ForcePasswordChange name={parent.name} />;
  await sweepCalls(parent.familyId);
  const [family, pending, pendingWishes] = await Promise.all([
    db.family.findUniqueOrThrow({ where: { id: parent.familyId }, select: { name: true, callingEnabled: true } }),
    db.memory.count({ where: { status: "PROPOSED", child: childWhere(parent) } }),
    db.wishListItem.count({ where: { approved: false, child: childWhere(parent) } }),
  ]);
  return (
    <DashboardShell isOwner={parent.isOwner} parentName={parent.name} familyName={family.name} pendingMemories={pending} pendingWishes={pendingWishes} callingEnabled={family.callingEnabled}>
      {children}
    </DashboardShell>
  );
}
