import { describe, expect, it } from "vitest";
import { hashSecret, hashToken, newToken, safeEqual, verifySecret } from "@/lib/auth/password";
import { sniffImageType } from "@/lib/image";
import { allowedCallSeconds, formatDuration, isValidTimezone, startOfLocalDay } from "@/lib/time";
import { callEndSchema, callStartSchema, childSchema, dataDeletionSchema, talkingPointSchema } from "@/lib/validation";
import { isKnownVoice, REALTIME_VOICES } from "@/lib/santa/voices";

describe("password hashing", () => {
  it("verifies the right secret and rejects the wrong one", async () => {
    const hash = await hashSecret("correct horse battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifySecret("correct horse battery", hash)).toBe(true);
    expect(await verifySecret("wrong", hash)).toBe(false);
    expect(await verifySecret("anything", null)).toBe(false);
    expect(await verifySecret("anything", "garbage")).toBe(false);
  });

  it("creates unguessable tokens and stores only hashes", () => {
    const a = newToken();
    const b = newToken();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("call limits", () => {
  it("uses the smaller of per-call and remaining daily time", () => {
    expect(allowedCallSeconds({ maxCallMinutes: 10, dailyMinutes: 20, usedTodaySeconds: 0 })).toBe(600);
    expect(allowedCallSeconds({ maxCallMinutes: 10, dailyMinutes: 20, usedTodaySeconds: 900 })).toBe(300);
    expect(allowedCallSeconds({ maxCallMinutes: 10, dailyMinutes: 20, usedTodaySeconds: 1500 })).toBe(0);
  });
  it("subtracts time already used when reconnecting a dropped call", () => {
    expect(allowedCallSeconds({ maxCallMinutes: 10, dailyMinutes: 60, usedTodaySeconds: 200, carriedOverSeconds: 200 })).toBe(400);
  });
});

describe("time helpers", () => {
  it("finds local midnight across time zones", () => {
    const now = new Date("2026-12-10T03:30:00Z"); // 10:30pm Dec 9 in New York
    expect(startOfLocalDay(now, "America/New_York").toISOString()).toBe("2026-12-09T05:00:00.000Z");
    expect(startOfLocalDay(now, "Europe/London").toISOString()).toBe("2026-12-10T00:00:00.000Z");
  });
  it("validates time zones", () => {
    expect(isValidTimezone("America/Chicago")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
  });
  it("formats durations like a phone", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
});

describe("image sniffing", () => {
  it("detects real image types from magic bytes", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(sniffImageType(new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]))).toBe("image/webp");
    expect(sniffImageType(new Uint8Array(Buffer.from("<svg onload=alert(1)>")))).toBeNull();
  });
});

describe("validation", () => {
  it("requires a first name for a child", () => {
    expect(childSchema.safeParse({ firstName: "" }).success).toBe(false);
    expect(childSchema.safeParse({ firstName: "Alex", age: 13 }).success).toBe(true);
  });
  it("validates talking point priority and dates", () => {
    expect(talkingPointSchema.safeParse({ topic: "x", details: "y", priority: "URGENT" }).success).toBe(false);
    expect(talkingPointSchema.safeParse({ topic: "x", details: "y", expiresAt: "12/20/2026" }).success).toBe(false);
    expect(talkingPointSchema.parse({ topic: "x", details: "y" }).priority).toBe("NORMAL");
  });
  it("bounds call payloads", () => {
    expect(callStartSchema.safeParse({ childId: "c1", sdp: "short" }).success).toBe(false);
    expect(callEndSchema.safeParse({ reason: "made_up" }).success).toBe(false);
    expect(callEndSchema.safeParse({ reason: "user_hangup", transcript: [{ role: "santa", text: "Hi" }] }).success).toBe(true);
  });
  it("requires explicit confirmation to delete data", () => {
    expect(dataDeletionSchema.safeParse({ scope: "memories", confirm: "delete" }).success).toBe(false);
    expect(dataDeletionSchema.safeParse({ scope: "memories", confirm: "DELETE" }).success).toBe(true);
  });
});

describe("voices", () => {
  it("defaults to a supported realtime voice", () => {
    expect(isKnownVoice("cedar")).toBe(true);
    expect(isKnownVoice("santa-custom")).toBe(false);
    expect(REALTIME_VOICES.length).toBeGreaterThan(5);
  });
});
