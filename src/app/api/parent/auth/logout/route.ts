import type { NextRequest } from "next/server";
import { destroyParentSession } from "@/lib/auth/session";
import { assertSameOrigin, handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  await destroyParentSession();
  return json({ ok: true });
});
