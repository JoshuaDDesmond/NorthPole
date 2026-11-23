-- Shared household facts a parent wants Santa to know on calls from every child they manage.
ALTER TABLE "ParentUser" ADD COLUMN "householdNotes" TEXT NOT NULL DEFAULT '';
