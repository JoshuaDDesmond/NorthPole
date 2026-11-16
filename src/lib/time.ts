function localParts(at: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  })
    .formatToParts(at)
    .reduce<Record<string, number>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = Number(p.value);
      return acc;
    }, {});
}

/** The time zone's offset from UTC (ms) at a given instant. */
function offsetAt(at: Date, timezone: string) {
  const p = localParts(at, timezone);
  const localAsUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour! % 24, p.minute!, p.second!);
  return localAsUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Returns the UTC instant of local midnight (start of "today") in the given IANA timezone. */
export function startOfLocalDay(now: Date, timezone: string): Date {
  const p = localParts(now, timezone);
  const midnightAsUtc = Date.UTC(p.year!, p.month! - 1, p.day!);
  // Use the offset in effect at midnight itself, which differs from "now" on daylight-saving days.
  let guess = midnightAsUtc - offsetAt(now, timezone);
  guess = midnightAsUtc - offsetAt(new Date(guess), timezone);
  return new Date(guess);
}

/** UTC instant of local midnight on the most recent Monday (start of the calling week). */
export function startOfLocalWeek(now: Date, timezone: string): Date {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(now);
  const daysSinceMonday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday);
  // Step back day by day via local midnights so daylight-saving shifts are handled.
  let start = startOfLocalDay(now, timezone);
  for (let i = 0; i < Math.max(0, daysSinceMonday); i++) {
    start = startOfLocalDay(new Date(start.getTime() - 12 * 3600_000), timezone);
  }
  return start;
}

/** UTC instant of local midnight on the 1st of the current month. */
export function startOfLocalMonth(now: Date, timezone: string): Date {
  const dayOfMonth = Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, day: "numeric" }).format(now));
  let start = startOfLocalDay(now, timezone);
  for (let i = 1; i < dayOfMonth; i++) start = startOfLocalDay(new Date(start.getTime() - 12 * 3600_000), timezone);
  return start;
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? h + ":" : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/**
 * Seconds a child may talk on the next call: the smaller of the per-call cap
 * and what remains of today's allowance. Never negative.
 */
export function allowedCallSeconds(opts: {
  maxCallMinutes: number;
  dailyMinutes: number;
  usedTodaySeconds: number;
  weeklyMinutes?: number;
  usedThisWeekSeconds?: number;
  carriedOverSeconds?: number;
}) {
  const perCall = opts.maxCallMinutes * 60 - (opts.carriedOverSeconds ?? 0);
  const remainingToday = opts.dailyMinutes * 60 - opts.usedTodaySeconds;
  const remainingThisWeek = opts.weeklyMinutes != null ? opts.weeklyMinutes * 60 - (opts.usedThisWeekSeconds ?? 0) : Infinity;
  return Math.max(0, Math.min(perCall, remainingToday, remainingThisWeek));
}
