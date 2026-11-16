import { redirect } from "next/navigation";
import { CallerPicker } from "@/components/call/CallerPicker";
import { FamilyAccess } from "@/components/call/FamilyAccess";
import { getFamilyDevice } from "@/lib/auth/session";
import { getFamilyView } from "@/lib/family-view";

export const dynamic = "force-dynamic";

export default async function Home() {
  const device = await getFamilyDevice();
  if (!device) return <FamilyAccess />;
  const view = await getFamilyView(device);
  if (!view) return <FamilyAccess />;
  if (view.callers.length === 1) redirect(`/call/${view.callers[0]!.id}`);
  return <CallerPicker callers={view.callers} photoUrl={view.photoUrl} />;
}
