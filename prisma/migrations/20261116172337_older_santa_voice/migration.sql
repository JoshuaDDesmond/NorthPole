-- AlterTable
ALTER TABLE "SantaPersonality" ADD COLUMN     "speakingPace" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
ALTER COLUMN "voice" SET DEFAULT 'ash';

-- Cedar sounded too young for Santa; move families still on Cedar to Ash.
UPDATE "SantaPersonality" SET "voice" = 'ash' WHERE "voice" = 'cedar';
