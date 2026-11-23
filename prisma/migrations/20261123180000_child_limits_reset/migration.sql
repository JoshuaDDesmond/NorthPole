-- Owner can reset a child's daily and weekly time limits without deleting call history.
ALTER TABLE "Child" ADD COLUMN "limitsResetAt" TIMESTAMP(3);
