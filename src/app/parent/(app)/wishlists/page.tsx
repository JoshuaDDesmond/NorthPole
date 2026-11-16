import { Gift } from "lucide-react";
import Link from "next/link";
import { WishListEditor } from "@/components/parent/WishListEditor";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireParentPage } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { childWhere } from "@/lib/parent-data";
import { toWishView } from "@/lib/wish-view";

export const dynamic = "force-dynamic";

export default async function WishListsPage() {
  const parent = await requireParentPage();
  const children = await db.child.findMany({
    where: childWhere(parent),
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { wishes: { orderBy: [{ topWish: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }] } },
  });

  return (
    <div>
      <PageHeader
        title="Wish Lists"
        description="Everything on the kids' lists in one place. When a kid tells Santa about a new wish on a call, it shows up here for you to keep. Santa sees the wish and its details, never links, notes or what's been bought."
      />
      {children.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Gift className="h-5 w-5" />}
            title="No children yet"
            body="Add a child first, then build their wish list here."
            action={
              <Link href="/parent/children/new" className="inline-flex h-10 items-center rounded-xl bg-gold px-4 text-sm font-medium text-ink">
                Add child
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {children.map((c) => (
            <WishListEditor key={c.id} compact childId={c.id} childName={c.nickname || c.firstName} wishes={c.wishes.map(toWishView)} />
          ))}
        </div>
      )}
    </div>
  );
}
