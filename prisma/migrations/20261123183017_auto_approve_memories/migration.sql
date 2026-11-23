-- New memories from calls go straight to Santa unless the family turns this off.
ALTER TABLE "Family" ADD COLUMN "autoApproveMemories" BOOLEAN NOT NULL DEFAULT true;

-- Memories already waiting for review go to Santa now too (except ones from calls flagged for a check-in).
UPDATE "Memory" m SET "status" = 'APPROVED'
WHERE m."status" = 'PROPOSED'
  AND NOT EXISTS (SELECT 1 FROM "Call" c WHERE c."id" = m."callId" AND c."safetyFlag" = true);

-- Each call's conversation plan, so the next call opens differently.
ALTER TABLE "Call" ADD COLUMN "conversationPlan" TEXT;
