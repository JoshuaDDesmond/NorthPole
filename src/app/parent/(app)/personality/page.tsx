import { SantaPersonalityEditor } from "@/components/parent/SantaPersonality";
import { PageHeader } from "@/components/ui";
import { requireParentPage } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PersonalityPage() {
  const parent = await requireParentPage();
  const p = await db.santaPersonality.upsert({ where: { familyId: parent.familyId }, create: { familyId: parent.familyId }, update: {} });
  return (
    <div>
      <PageHeader title="Santa's Personality" description="Shape how Santa sounds and carries a conversation. Changes apply from the next call." />
      <SantaPersonalityEditor
        initial={{
          voice: p.voice,
          customVoiceId: p.customVoiceId ?? "",
          humor: p.humor,
          energy: p.energy,
          northPoleReferences: p.northPoleReferences,
          conversationLength: p.conversationLength,
          topicsToAvoid: p.topicsToAvoid,
          nextCallInstructions: p.nextCallInstructions,
        }}
      />
    </div>
  );
}
