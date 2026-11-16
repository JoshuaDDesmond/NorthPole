import { redirect } from "next/navigation";
import { AuthShell, SetupForm } from "@/components/parent/AuthForms";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if ((await db.parentUser.count()) > 0) redirect("/parent/login");
  return (
    <AuthShell title="Set up Santa's line" subtitle="Create the first parent account. You can add another parent later.">
      <SetupForm />
    </AuthShell>
  );
}
