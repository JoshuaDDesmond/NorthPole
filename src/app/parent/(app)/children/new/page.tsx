import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { ChildProfileEditor, EMPTY_CHILD } from "@/components/parent/ChildProfileEditor";
import { PageHeader } from "@/components/ui";
import { requireParentPage } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function NewChildPage() {
  await requireParentPage();
  return (
    <div>
      <Link href="/parent/children" className="mb-4 inline-flex items-center gap-1 text-sm text-mist hover:text-snow">
        <ChevronLeft className="h-4 w-4" /> Children
      </Link>
      <PageHeader title="Add a child" description="Share as much or as little as you like. Everything here is private and you can change or delete it any time." />
      <ChildProfileEditor initial={EMPTY_CHILD} />
    </div>
  );
}
