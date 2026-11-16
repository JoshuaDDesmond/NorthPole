import { CallingSwitch, VoiceStatusCard } from "@/components/parent/Widgets";
import { CallingPreferencesPanel, ConsentPanel, DataDeletionPanel, FamilyAccessPanel, ParentAccountsPanel, PhotoPanel } from "@/components/parent/SettingsPanels";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requireParentPage } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const parent = await requireParentPage();
  const family = await db.family.findUniqueOrThrow({
    where: { id: parent.familyId },
    select: {
      name: true,
      timezone: true,
      callingEnabled: true,
      parentConsentAt: true,
      maxCallMinutes: true,
      dailyMinutesPerChild: true,
      generateMemoryProposals: true,
      ambientSound: true,
      familyAccessCodeHash: true,
      familyAccessVersion: true,
      santaPhotoType: true,
      santaPhotoUpdatedAt: true,
    },
  });
  const [devices, parents] = await Promise.all([
    db.familyDevice.findMany({
      where: { familyId: parent.familyId, revokedAt: null, accessVersion: family.familyAccessVersion, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
    }),
    db.parentUser.findMany({ where: { familyId: parent.familyId }, orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Access, limits, privacy and the voice service." />

      <CallingSwitch enabled={family.callingEnabled} />

      <PhotoPanel photoUrl={`/api/santa-photo?v=${family.santaPhotoUpdatedAt?.getTime() ?? 0}`} hasCustom={Boolean(family.santaPhotoType)} />

      <FamilyAccessPanel
        hasCode={Boolean(family.familyAccessCodeHash)}
        devices={devices.map((d) => ({ id: d.id, label: d.label, createdAt: d.createdAt.toISOString(), lastSeenAt: d.lastSeenAt.toISOString() }))}
      />

      <CallingPreferencesPanel
        initial={{
          name: family.name,
          timezone: family.timezone,
          maxCallMinutes: family.maxCallMinutes,
          dailyMinutesPerChild: family.dailyMinutesPerChild,
          generateMemoryProposals: family.generateMemoryProposals,
          ambientSound: family.ambientSound,
        }}
      />

      <ConsentPanel consentAt={family.parentConsentAt?.toISOString() ?? null} />

      <Card>
        <CardHeader title="Voice service" description="Santa's voice runs on the OpenAI Realtime API. Keys stay on the server and never reach a browser." />
        <div className="space-y-4 p-5 sm:p-6">
          <VoiceStatusCard />
          <p className="text-xs leading-relaxed text-mist">
            To connect or change the key, set <code className="rounded bg-white/10 px-1 py-0.5 text-snow">OPENAI_API_KEY</code> in your hosting provider&apos;s environment variables and
            redeploy. See the README for details.
          </p>
        </div>
      </Card>

      <ParentAccountsPanel
        currentUserId={parent.userId}
        parents={parents.map((p) => ({ id: p.id, name: p.name, email: p.email, lastLoginAt: p.lastLoginAt?.toISOString() ?? null }))}
      />

      <DataDeletionPanel />
    </div>
  );
}
