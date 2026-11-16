import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell, LoginForm } from "@/components/parent/AuthForms";
import { getParent } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getParent()) redirect("/parent");
  const needsSetup = (await db.parentUser.count()) === 0;
  if (needsSetup) redirect("/parent/setup");
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to manage Santa's line."
      footer={
        <Link href="/" className="underline decoration-mist/40 underline-offset-2 hover:text-snow">
          Back to the North Pole line
        </Link>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
