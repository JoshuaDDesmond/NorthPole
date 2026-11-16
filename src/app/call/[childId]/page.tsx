import { redirect } from "next/navigation";
import { CallScreen } from "@/components/call/CallScreen";
import { getFamilyDevice } from "@/lib/auth/session";
import { getFamilyView } from "@/lib/family-view";

export const dynamic = "force-dynamic";

export default async function CallPage({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const device = await getFamilyDevice();
  if (!device) redirect("/");
  const view = await getFamilyView(device.familyId);
  const caller = view?.callers.find((c) => c.id === childId);
  if (!view || !caller) redirect("/");
  return (
    <CallScreen
      key={caller.id}
      childId={caller.id}
      childName={caller.name}
      photoUrl={view.photoUrl}
      ambientSound={view.ambientSound}
      canSwitchCaller={view.callers.length > 1}
    />
  );
}
