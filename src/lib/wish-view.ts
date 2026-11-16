import type { WishView } from "@/components/parent/WishListEditor";

type WishRow = {
  id: string;
  title: string;
  details: string;
  link: string | null;
  notes: string;
  topWish: boolean;
  purchased: boolean;
  santaCanMention: boolean;
  approved: boolean;
  source: "PARENT" | "CALL";
  createdAt: Date;
};

export function toWishView(w: WishRow): WishView {
  return {
    id: w.id,
    title: w.title,
    details: w.details,
    link: w.link,
    notes: w.notes,
    topWish: w.topWish,
    purchased: w.purchased,
    santaCanMention: w.santaCanMention,
    approved: w.approved,
    source: w.source,
    createdAt: w.createdAt.toISOString(),
  };
}
