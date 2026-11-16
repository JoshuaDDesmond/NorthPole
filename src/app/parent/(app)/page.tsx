import { ArrowRight, Check, Circle, Phone, Sparkles, UserPlus } from "lucide-react";
import Link from "next/link";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { CallingSwitch, HangUpButton, VoiceStatusCard } from "@/components/parent/Widgets";
import { requireParentPage } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatDuration } from "@/lib/time";
import { childWhere } from "@/lib/parent-data";
import { UsageCard } from "@/components/parent/UsageCard";
import { familyUsage } from "@/lib/usage";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const parent = await requireParentPage();
  const familyId = parent.familyId;
  const kids = childWhere(parent);
  const [family, me, children, liveCalls, pending, recent] = await Promise.all([
    db.family.findUniqueOrThrow({ where: { id: familyId } }),
    db.parentUser.findUniqueOrThrow({ where: { id: parent.userId }, select: { accessCodeHash: true, consentAt: true } }),
    db.child.findMany({
      where: kids,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { talkingPoints: { where: { enabled: true } }, memories: { where: { status: "APPROVED" } }, calls: true } } },
    }),
    db.call.findMany({ where: { status: "ACTIVE", child: kids }, include: { child: { select: { firstName: true } } } }),
    db.memory.count({ where: { status: "PROPOSED", child: kids } }),
    db.call.findMany({ where: { child: kids, connectedAt: { not: null } }, orderBy: { startedAt: "desc" }, take: 4, include: { child: { select: { firstName: true } } } }),
  ]);

  const steps = [
    ...(parent.isOwner ? [{ done: Boolean(env.openaiApiKey), label: "Add your OpenAI API key on the server", href: "/parent/settings" }] : []),
    { done: children.length > 0, label: parent.isOwner ? "Add a child's profile" : "Add your child's profile", href: "/parent/children/new" },
    { done: Boolean(me.accessCodeHash), label: "Create your device code for your kids' phones or tablets", href: "/parent/settings#access" },
    { done: Boolean(me.consentAt), label: "Review and confirm the parent consent", href: "/parent/settings#consent" },
  ];
  const setupDone = steps.every((s) => s.done);
  const usage = parent.isOwner ? await familyUsage(familyId) : null;

  return (
    <div className="space-y-6">
      <PageHeader title={`Hello, ${parent.name.split(" ")[0]}`} description="Everything Santa knows comes from this book. You stay in control of every detail." />

      {liveCalls.length > 0 && (
        <Card className="border-call/30">
          <div className="flex flex-col gap-3 p-5">
            {liveCalls.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-call/70 animate-pulse-soft" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-call" />
                  </span>
                  <p className="text-sm text-snow">
                    {c.child.firstName} is on the phone with Santa now
                    {c.connectedAt && <span className="text-mist"> · started {c.connectedAt.toLocaleTimeString("en-US", { timeZone: family.timezone, hour: "numeric", minute: "2-digit" })}</span>}
                  </p>
                </div>
                <HangUpButton callId={c.id} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {!setupDone && (
        <Card>
          <CardHeader title="Finish setting up" description="A few steps before the first call to the North Pole." />
          <ul className="divide-y divide-line">
            {steps.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className="flex items-center gap-3 px-5 py-3.5 text-sm transition hover:bg-white/[0.03] sm:px-6">
                  {s.done ? <Check className="h-4 w-4 text-call" /> : <Circle className="h-4 w-4 text-mist/50" />}
                  <span className={s.done ? "text-mist line-through decoration-mist/40" : "text-snow"}>{s.label}</span>
                  {!s.done && <ArrowRight className="ml-auto h-4 w-4 text-mist" />}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {parent.isOwner ? (
        <CallingSwitch enabled={family.callingEnabled} />
      ) : (
        !family.callingEnabled && (
          <Card className="border-berry/40">
            <p className="p-5 text-sm text-snow">Santa&apos;s line is turned off for the whole family right now. The family owner can turn it back on.</p>
          </Card>
        )
      )}

      <div className="grid items-start gap-6 md:grid-cols-2">
        <Card>
          <CardHeader
            title={parent.isOwner ? "Children" : "Your children"}
            action={
              <Link href="/parent/children/new" className="inline-flex items-center gap-1.5 text-xs font-medium text-gold hover:text-gold-2">
                <UserPlus className="h-3.5 w-3.5" /> Add child
              </Link>
            }
          />
          {children.length === 0 ? (
            <p className="px-6 py-8 text-sm text-mist">{parent.isOwner ? "No children yet. Add one so Santa knows who's calling." : "No children are assigned to you yet. Add your child, or ask the family owner to give you access."}</p>
          ) : (
            <ul className="divide-y divide-line">
              {children.map((c) => (
                <li key={c.id}>
                  <Link href={`/parent/children/${c.id}`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-white/[0.03] sm:px-6">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-evergreen text-sm font-semibold text-gold">{c.firstName.charAt(0)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-snow">
                        {c.firstName}
                        {c.nickname && <span className="text-mist"> “{c.nickname}”</span>}
                      </p>
                      <p className="text-xs text-mist">
                        {c._count.talkingPoints} talking points · {c._count.memories} memories · {c._count.calls} calls
                      </p>
                    </div>
                    {!c.callingEnabled && <Badge tone="red">Paused</Badge>}
                    <ArrowRight className="h-4 w-4 text-mist" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          {parent.isOwner && (
            <Card>
              <div className="p-5 sm:px-6">
                <VoiceStatusCard />
              </div>
            </Card>
          )}
          <Card>
            <Link href="/parent/memories" className="flex items-center gap-3 p-5 transition hover:bg-white/[0.03] sm:px-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/15">
                <Sparkles className="h-5 w-5 text-gold" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-snow">{pending ? `${pending} memor${pending === 1 ? "y" : "ies"} waiting for review` : "No memories waiting for review"}</p>
                <p className="text-xs text-mist">Santa only remembers what you approve.</p>
              </div>
              <ArrowRight className="h-4 w-4 text-mist" />
            </Link>
          </Card>
          <Card>
            <CardHeader title="Recent calls" action={<Link href="/parent/history" className="text-xs font-medium text-gold hover:text-gold-2">View all</Link>} />
            {recent.length === 0 ? (
              <p className="px-6 py-6 text-sm text-mist">No calls yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {recent.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-3 text-sm sm:px-6">
                    <Phone className="h-4 w-4 text-mist" />
                    <span className="text-snow">{c.child.firstName}</span>
                    <span className="text-mist">{c.startedAt.toLocaleDateString("en-US", { timeZone: family.timezone, month: "short", day: "numeric" })}</span>
                    <span className="ml-auto tabular-nums text-mist">{formatDuration(c.durationSec)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {usage && <UsageCard usage={usage} />}
    </div>
  );
}
