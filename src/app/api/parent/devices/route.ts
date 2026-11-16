import { requireParent } from "@/lib/auth/session";
import { listDevices } from "@/lib/devices";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** A parent sees devices paired with their own code; the owner sees every device in the family. */
export const GET = handle(async () => {
  const parent = await requireParent();
  return json({ devices: await listDevices(parent) });
});
