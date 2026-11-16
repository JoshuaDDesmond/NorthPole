-- AlterTable
ALTER TABLE "Family" ADD COLUMN     "elevenAgentId" TEXT;

-- AlterTable
ALTER TABLE "SantaPersonality" ADD COLUMN     "elevenLlm" TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
ADD COLUMN     "elevenVoiceId" TEXT;
