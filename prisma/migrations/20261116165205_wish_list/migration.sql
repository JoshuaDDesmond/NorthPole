-- CreateEnum
CREATE TYPE "WishSource" AS ENUM ('PARENT', 'CALL');

-- CreateTable
CREATE TABLE "WishListItem" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "link" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "topWish" BOOLEAN NOT NULL DEFAULT false,
    "purchased" BOOLEAN NOT NULL DEFAULT false,
    "santaCanMention" BOOLEAN NOT NULL DEFAULT true,
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "source" "WishSource" NOT NULL DEFAULT 'PARENT',
    "callId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WishListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WishListItem_childId_idx" ON "WishListItem"("childId");

-- AddForeignKey
ALTER TABLE "WishListItem" ADD CONSTRAINT "WishListItem_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishListItem" ADD CONSTRAINT "WishListItem_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;
