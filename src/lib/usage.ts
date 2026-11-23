import "server-only";
import { db } from "./db";
import { elapsedSeconds } from "./calls/lifecycle";
import { startOfLocalMonth, startOfLocalWeek } from "./time";

/** Exact calling usage from the app's own call records, for the owner's dashboard. */
export async function familyUsage(familyId: string, now = new Date()) {
  const family = await db.family.findUniqueOrThrow({
    where: { id: familyId },
    select: { timezone: true, weeklyMinutesPerChild: true, children: { select: { id: true, firstName: true, nickname: true, limitsResetAt: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
  const monthStart = startOfLocalMonth(now, family.timezone);
  const weekStart = startOfLocalWeek(now, family.timezone);
  const calls = await db.call.findMany({
    where: { child: { familyId }, connectedAt: { not: null }, startedAt: { gte: monthStart < weekStart ? monthStart : weekStart } },
    select: { childId: true, startedAt: true, connectedAt: true, status: true, durationSec: true },
  });
  const secs = (c: (typeof calls)[number]) => (c.status === "ACTIVE" ? elapsedSeconds(c, now) : c.durationSec);
  const perChild = family.children.map((child) => {
    const mine = calls.filter((c) => c.childId === child.id);
    const month = mine.filter((c) => c.startedAt >= monthStart);
    // Toward the weekly limit: this week's calls since any owner reset.
    const countFrom = child.limitsResetAt && child.limitsResetAt > weekStart ? child.limitsResetAt : weekStart;
    const week = mine.filter((c) => c.startedAt >= countFrom);
    return {
      childId: child.id,
      name: child.nickname || child.firstName,
      monthSeconds: month.reduce((s, c) => s + secs(c), 0),
      monthCalls: month.length,
      weekSeconds: week.reduce((s, c) => s + secs(c), 0),
      resetThisWeek: Boolean(child.limitsResetAt && child.limitsResetAt > weekStart),
    };
  });
  return {
    monthLabel: new Intl.DateTimeFormat("en-US", { timeZone: family.timezone, month: "long" }).format(now),
    weeklyLimitMinutes: family.weeklyMinutesPerChild,
    totalMonthSeconds: perChild.reduce((s, c) => s + c.monthSeconds, 0),
    totalMonthCalls: perChild.reduce((s, c) => s + c.monthCalls, 0),
    perChild,
  };
}
