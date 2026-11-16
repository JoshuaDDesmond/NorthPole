import { CallingSwitch, ConnectElevenLabsButton, VoiceStatusCard } from "@/components/parent/Widgets";
import { env } from "@/lib/env";
import {
  CallingPreferencesPanel,
  ConsentPanel,
  DataDeletionPanel,
  DeviceCodePanel,
  MyAccountPanel,
  ParentsPanel,
  PhotoPanel,
} from "@/components/parent/SettingsPanels";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requireParentPage } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listDevices } from "@/lib/devices";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const parent = await requireParentPage();
  const [family, me, devices] = await Promise.all([
    db.family.findUniqueOrThrow({
      where: { id: parent.familyId },
      select: {
        name: true,
        timezone: true,
        callingEnabled: true,
        maxCallMinutes: true,
        dailyMinutesPerChild: true,
        weeklyMinutesPerChild: true,
        generateMemoryProposals: true,
        autoRecallCalls: true,
        ambientSound: true,
        santaPhotoType: true,
        santaPhotoUpdatedAt: true,
        elevenAgentId: true,
      },
    }),
    db.parentUser.findUniqueOrThrow({ where: { id: parent.userId }, select: { accessCodeHash: true, consentAt: true } }),
    listDevices(parent),
  ]);

  const [parents, kids] = parent.isOwner
    ? await Promise.all([
        db.parentUser.findMany({
          where: { familyId: parent.familyId },
          orderBy: { createdAt: "asc" },
          include: { children: { select: { childId: true } } },
        }),
        db.child.findMany({ where: { familyId: parent.familyId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, firstName: true, nickname: true } }),
      ])
    : [[], []];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description={parent.isOwner ? "Access, limits, privacy and the voice service for the whole family." : "Your device code, consent and account."}
      />

      {parent.isOwner && <CallingSwitch enabled={family.callingEnabled} />}

      <DeviceCodePanel hasCode={Boolean(me.accessCodeHash)} devices={devices} isOwner={parent.isOwner} />

      <ConsentPanel consentAt={me.consentAt?.toISOString() ?? null} />

      {parent.isOwner && (
        <ParentsPanel
          currentUserId={parent.userId}
          kids={kids.map((k) => ({ id: k.id, name: k.nickname || k.firstName }))}
          parents={parents.map((p) => ({
            id: p.id,
            name: p.name,
            email: p.email,
            role: p.role,
            lastLoginAt: p.lastLoginAt?.toISOString() ?? null,
            consentAt: p.consentAt?.toISOString() ?? null,
            mustChangePassword: p.mustChangePassword,
            hasDeviceCode: Boolean(p.accessCodeHash),
            childIds: p.children.map((c) => c.childId),
          }))}
        />
      )}

      {parent.isOwner && (
        <>
          <PhotoPanel photoUrl={`/api/santa-photo?v=${family.santaPhotoUpdatedAt?.getTime() ?? 0}`} hasCustom={Boolean(family.santaPhotoType)} />
          <CallingPreferencesPanel
            initial={{
              name: family.name,
              timezone: family.timezone,
              maxCallMinutes: family.maxCallMinutes,
              dailyMinutesPerChild: family.dailyMinutesPerChild,
              weeklyMinutesPerChild: family.weeklyMinutesPerChild,
              generateMemoryProposals: family.generateMemoryProposals,
              autoRecallCalls: family.autoRecallCalls,
              ambientSound: family.ambientSound,
            }}
          />
          <Card>
            <CardHeader
              title="Voice service"
              description={
                env.voiceProvider === "elevenlabs"
                  ? "Santa's voice and conversation run on ElevenLabs. Keys stay on the server and never reach a browser."
                  : "Santa's voice runs on the OpenAI Realtime API. Keys stay on the server and never reach a browser."
              }
            />
            <div className="space-y-4 p-5 sm:p-6">
              <VoiceStatusCard />
              {env.voiceProvider === "elevenlabs" && (
                <div className="flex flex-wrap items-center gap-3">
                  <ConnectElevenLabsButton connected={Boolean(family.elevenAgentId ?? env.elevenLabsAgentId)} />
                  <p className="text-xs text-mist">Creates Santa&apos;s agent in your ElevenLabs account with the right settings. Safe to press again anytime.</p>
                </div>
              )}
              <p className="text-xs leading-relaxed text-mist">
                {env.voiceProvider === "elevenlabs" ? (
                  <>
                    Keys live in Vercel: <code className="rounded bg-white/10 px-1 py-0.5 text-snow">ELEVENLABS_API_KEY</code> for the voice, and{" "}
                    <code className="rounded bg-white/10 px-1 py-0.5 text-snow">OPENAI_API_KEY</code> for post-call summaries (optional). Redeploy after changing a key.
                  </>
                ) : (
                  <>
                    To connect or change the key, set <code className="rounded bg-white/10 px-1 py-0.5 text-snow">OPENAI_API_KEY</code> in your hosting provider&apos;s environment
                    variables and redeploy. Add <code className="rounded bg-white/10 px-1 py-0.5 text-snow">ELEVENLABS_API_KEY</code> to switch Santa to ElevenLabs.
                  </>
                )}
              </p>
            </div>
          </Card>
        </>
      )}

      {!parent.isOwner && (
        <Card>
          <p className="p-5 text-sm leading-relaxed text-mist sm:p-6">
            Santa&apos;s voice, personality, call limits and the contact photo are managed by the family owner for everyone.
          </p>
        </Card>
      )}

      <MyAccountPanel name={parent.name} email={parent.email} role={parent.role} />

      <DataDeletionPanel isOwner={parent.isOwner} />
    </div>
  );
}
