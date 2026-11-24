-- Pictures children send to Santa from the call screen.
CREATE TABLE "ChildPhoto" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "callId" TEXT,
    "image" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "safetyFlag" BOOLEAN NOT NULL DEFAULT false,
    "safetyNote" TEXT,
    "mentionedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChildPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChildPhoto_childId_createdAt_idx" ON "ChildPhoto"("childId", "createdAt");

ALTER TABLE "ChildPhoto" ADD CONSTRAINT "ChildPhoto_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;
