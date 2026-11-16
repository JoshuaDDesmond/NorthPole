-- CreateEnum
CREATE TYPE "ConversationLength" AS ENUM ('SHORT', 'MEDIUM', 'LONG');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('HIGH', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "MemoryStatus" AS ENUM ('PROPOSED', 'APPROVED');

-- CreateEnum
CREATE TYPE "MemorySource" AS ENUM ('CALL', 'PARENT');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('CONNECTING', 'ACTIVE', 'COMPLETED', 'FAILED', 'LIMIT_REACHED', 'DISCONNECTED', 'ENDED_BY_PARENT');

-- CreateEnum
CREATE TYPE "SummaryStatus" AS ENUM ('NONE', 'PROPOSED', 'APPROVED');

-- CreateTable
CREATE TABLE "Family" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Our Family',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "callingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "parentConsentAt" TIMESTAMP(3),
    "familyAccessCodeHash" TEXT,
    "familyAccessVersion" INTEGER NOT NULL DEFAULT 1,
    "maxCallMinutes" INTEGER NOT NULL DEFAULT 10,
    "dailyMinutesPerChild" INTEGER NOT NULL DEFAULT 20,
    "generateMemoryProposals" BOOLEAN NOT NULL DEFAULT true,
    "ambientSound" BOOLEAN NOT NULL DEFAULT false,
    "santaPhoto" BYTEA,
    "santaPhotoType" TEXT,
    "santaPhotoUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "Family_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SantaPersonality" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "voice" TEXT NOT NULL DEFAULT 'cedar',
    "customVoiceId" TEXT,
    "humor" INTEGER NOT NULL DEFAULT 3,
    "energy" INTEGER NOT NULL DEFAULT 3,
    "northPoleReferences" INTEGER NOT NULL DEFAULT 3,
    "conversationLength" "ConversationLength" NOT NULL DEFAULT 'MEDIUM',
    "topicsToAvoid" TEXT NOT NULL DEFAULT '',
    "nextCallInstructions" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SantaPersonality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentUser" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "ParentUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyDevice" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Family device',
    "accessVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "FamilyDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Child" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "nickname" TEXT NOT NULL DEFAULT '',
    "age" INTEGER,
    "birthday" TEXT NOT NULL DEFAULT '',
    "parents" TEXT NOT NULL DEFAULT '',
    "siblings" TEXT NOT NULL DEFAULT '',
    "pets" TEXT NOT NULL DEFAULT '',
    "school" TEXT NOT NULL DEFAULT '',
    "sportsAndTeams" TEXT NOT NULL DEFAULT '',
    "hobbies" TEXT NOT NULL DEFAULT '',
    "favoriteActivities" TEXT NOT NULL DEFAULT '',
    "accomplishments" TEXT NOT NULL DEFAULT '',
    "challengesAndGoals" TEXT NOT NULL DEFAULT '',
    "christmasWishes" TEXT NOT NULL DEFAULT '',
    "traditions" TEXT NOT NULL DEFAULT '',
    "otherDetails" TEXT NOT NULL DEFAULT '',
    "customFields" JSONB NOT NULL DEFAULT '[]',
    "topicsToAvoid" TEXT NOT NULL DEFAULT '',
    "nextCallInstructions" TEXT NOT NULL DEFAULT '',
    "callingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Child_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalkingPoint" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "expiresAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastDiscussedAt" TIMESTAMP(3),
    "timesDiscussed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalkingPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Memory" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "MemoryStatus" NOT NULL DEFAULT 'PROPOSED',
    "source" "MemorySource" NOT NULL DEFAULT 'CALL',
    "callId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "lastReferencedAt" TIMESTAMP(3),

    CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "deviceId" TEXT,
    "resumedFromId" TEXT,
    "status" "CallStatus" NOT NULL DEFAULT 'CONNECTING',
    "endReason" TEXT,
    "openaiCallId" TEXT,
    "model" TEXT,
    "voice" TEXT,
    "maxSeconds" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connectedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "summaryStatus" "SummaryStatus" NOT NULL DEFAULT 'NONE',
    "safetyFlag" BOOLEAN NOT NULL DEFAULT false,
    "safetyNote" TEXT,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateIndex
CREATE UNIQUE INDEX "SantaPersonality_familyId_key" ON "SantaPersonality"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentUser_email_key" ON "ParentUser"("email");

-- CreateIndex
CREATE INDEX "ParentSession_userId_idx" ON "ParentSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyDevice_tokenHash_key" ON "FamilyDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "FamilyDevice_familyId_idx" ON "FamilyDevice"("familyId");

-- CreateIndex
CREATE INDEX "Child_familyId_idx" ON "Child"("familyId");

-- CreateIndex
CREATE INDEX "TalkingPoint_childId_idx" ON "TalkingPoint"("childId");

-- CreateIndex
CREATE INDEX "Memory_childId_status_idx" ON "Memory"("childId", "status");

-- CreateIndex
CREATE INDEX "Call_childId_startedAt_idx" ON "Call"("childId", "startedAt");

-- CreateIndex
CREATE INDEX "Call_status_idx" ON "Call"("status");

-- AddForeignKey
ALTER TABLE "SantaPersonality" ADD CONSTRAINT "SantaPersonality_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentUser" ADD CONSTRAINT "ParentUser_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentSession" ADD CONSTRAINT "ParentSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ParentUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyDevice" ADD CONSTRAINT "FamilyDevice_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalkingPoint" ADD CONSTRAINT "TalkingPoint_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "FamilyDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
