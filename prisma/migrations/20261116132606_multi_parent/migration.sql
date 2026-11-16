-- Multi-parent access: roles, per-child assignments, per-parent device codes and consent.
-- Written to be safe on a database created by the previous version.

CREATE TYPE "ParentRole" AS ENUM ('OWNER', 'PARENT');

ALTER TABLE "ParentUser" ADD COLUMN "accessCodeHash" TEXT,
ADD COLUMN "accessVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "consentAt" TIMESTAMP(3),
ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "role" "ParentRole" NOT NULL DEFAULT 'PARENT';

-- The earliest parent in each family becomes the owner.
UPDATE "ParentUser" p SET "role" = 'OWNER'
WHERE p."id" = (SELECT p2."id" FROM "ParentUser" p2 WHERE p2."familyId" = p."familyId" ORDER BY p2."createdAt" ASC LIMIT 1);

-- Carry the old family-wide consent over to every existing parent.
UPDATE "ParentUser" p SET "consentAt" = f."parentConsentAt" FROM "Family" f WHERE f."id" = p."familyId";

CREATE TABLE "ChildAccess" (
    "parentUserId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChildAccess_pkey" PRIMARY KEY ("parentUserId","childId")
);
CREATE INDEX "ChildAccess_childId_idx" ON "ChildAccess"("childId");
ALTER TABLE "ChildAccess" ADD CONSTRAINT "ChildAccess_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "ParentUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChildAccess" ADD CONSTRAINT "ChildAccess_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Previously every parent saw every child; preserve that for existing data.
INSERT INTO "ChildAccess" ("parentUserId", "childId")
SELECT p."id", c."id" FROM "ParentUser" p JOIN "Child" c ON c."familyId" = p."familyId";

-- Devices were paired with the old family-wide code, which no longer exists.
DELETE FROM "FamilyDevice";
ALTER TABLE "FamilyDevice" ADD COLUMN "parentUserId" TEXT NOT NULL;
CREATE INDEX "FamilyDevice_parentUserId_idx" ON "FamilyDevice"("parentUserId");
ALTER TABLE "FamilyDevice" ADD CONSTRAINT "FamilyDevice_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "ParentUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Family" DROP COLUMN "familyAccessCodeHash",
DROP COLUMN "familyAccessVersion",
DROP COLUMN "parentConsentAt";
