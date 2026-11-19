import { describe, expect, it } from "vitest";
import {
  buildSantaInstructions,
  daysUntilChristmas,
  MAX_MEMORIES,
  selectMemories,
  selectTalkingPoints,
  wrapUpNudge,
  type BuildInput,
  type MemoryInput,
  type TalkingPointInput,
} from "@/lib/santa/prompt";

const NOW = new Date("2026-12-10T19:00:00Z");

function baseInput(overrides: Partial<BuildInput> = {}): BuildInput {
  return {
    personality: { humor: 3, energy: 3, northPoleReferences: 3, conversationLength: "MEDIUM", topicsToAvoid: "", nextCallInstructions: "" },
    child: {
      firstName: "Alex",
      nickname: "",
      age: 13,
      birthday: "",
      parents: "Mom and Dad",
      siblings: "",
      pets: "A beagle named Pepper",
      school: "",
      sportsAndTeams: "Lacrosse, Boston Celtics",
      hobbies: "",
      favoriteActivities: "",
      accomplishments: "",
      challengesAndGoals: "",
      christmasWishes: "A new lacrosse stick",
      traditions: "",
      otherDetails: "",
      customFields: [{ label: "Best friend", value: "Sam" }],
      topicsToAvoid: "",
      nextCallInstructions: "",
    },
    talkingPoints: [],
    memories: [],
    call: { now: NOW, timezone: "America/New_York", maxMinutes: 10, previousCallCount: 0, lastCallAt: null },
    ...overrides,
  };
}

const tp = (o: Partial<TalkingPointInput>): TalkingPointInput => ({
  id: Math.random().toString(36).slice(2),
  topic: "Topic",
  details: "Details",
  priority: "NORMAL",
  enabled: true,
  expiresAt: null,
  lastDiscussedAt: null,
  ...o,
});

const mem = (o: Partial<MemoryInput>): MemoryInput => ({
  id: Math.random().toString(36).slice(2),
  content: "Memory",
  status: "APPROVED",
  createdAt: new Date("2026-12-01"),
  lastReferencedAt: null,
  ...o,
});

describe("buildSantaInstructions", () => {
  it("includes parent-provided profile details, including custom fields", () => {
    const text = buildSantaInstructions(baseInput());
    expect(text).toContain("Alex");
    expect(text).toContain("A beagle named Pepper");
    expect(text).toContain("Lacrosse, Boston Celtics");
    expect(text).toContain("Best friend: Sam");
  });

  it("uses the nickname when present", () => {
    const input = baseInput();
    input.child.nickname = "Ace";
    expect(buildSantaInstructions(input)).toContain("talking with Ace");
  });

  it("never includes proposed (unapproved) memories", () => {
    const text = buildSantaInstructions(
      baseInput({
        memories: [mem({ content: "Approved: scored a goal last week" }), mem({ content: "Proposed: secret detail", status: "PROPOSED" })],
      }),
    );
    expect(text).toContain("Approved: scored a goal last week");
    expect(text).not.toContain("Proposed: secret detail");
  });

  it("excludes disabled and expired talking points", () => {
    const text = buildSantaInstructions(
      baseInput({
        talkingPoints: [
          tp({ topic: "Football", details: "Ask about the season" }),
          tp({ topic: "Disabled", details: "nope", enabled: false }),
          tp({ topic: "Expired", details: "old", expiresAt: new Date("2026-12-01") }),
          tp({ topic: "Future", details: "still valid", expiresAt: new Date("2026-12-20") }),
        ],
      }),
    );
    expect(text).toContain("Football: Ask about the season");
    expect(text).toContain("Future: still valid");
    expect(text).not.toContain("Disabled");
    expect(text).not.toContain("Expired: old");
  });

  it("includes family-wide and child-specific topics to avoid and next-call notes", () => {
    const input = baseInput();
    input.personality.topicsToAvoid = "the move";
    input.child.topicsToAvoid = "grandpa's health";
    input.child.nextCallInstructions = "Congratulate on the science fair.";
    const text = buildSantaInstructions(input);
    expect(text).toContain("the move; grandpa's health");
    expect(text).toContain("Congratulate on the science fair.");
  });

  it("contains the core safety and honesty boundaries", () => {
    const text = buildSantaInstructions(baseInput());
    expect(text).toMatch(/Never promise any specific present/);
    expect(text).toMatch(/naughty list/);
    expect(text).toMatch(/Of course I'm real!/);
    expect(text).not.toMatch(/AI version/);
    expect(text).toMatch(/Never claim to secretly watch/);
    expect(text).toMatch(/secrets from parents/);
    expect(text).toMatch(/Never invent memories/);
  });

  it("follows a Santa call shape: good-this-year and the wish early, then keeps the conversation going", () => {
    const text = buildSantaInstructions(baseInput());
    expect(text).toMatch(/busy season at the workshop/);
    expect(text).toMatch(/have you been good this year/);
    expect(text).toMatch(/by about the one-and-a-half-minute mark/);
    expect(text).toMatch(/what they're hoping for this Christmas/);
    expect(text).toMatch(/bring up one or two more things/);
    expect(text).toMatch(/between three and five minutes/);
    expect(text).toMatch(/Ask one question at a time/);
  });

  it("gives Santa a recap of recent calls so each call continues the last", () => {
    const input = baseInput();
    input.call.previousCallCount = 2;
    input.call.recentCalls = [
      { at: new Date("2026-12-08T23:00:00Z"), summary: "Talked about the hockey tournament and asked for a goalie stick." },
      { at: new Date("2026-12-01T23:00:00Z"), summary: "Shared that the dog learned a new trick." },
    ];
    const text = buildSantaInstructions(input);
    expect(text).toContain("# Your recent calls with Alex");
    expect(text).toContain("hockey tournament and asked for a goalie stick");
    expect(text).toMatch(/pick up from last time/);
  });

  it("tells Santa to sound like an older man", () => {
    const text = buildSantaInstructions(baseInput());
    expect(text).toMatch(/late sixties/);
    expect(text).toMatch(/Never sound young/);
  });

  it("states the call length limit", () => {
    const input = baseInput();
    input.call.maxMinutes = 7;
    expect(buildSantaInstructions(input)).toContain("at most 7 minutes");
  });

  it("adds reconnect context only when resuming", () => {
    expect(buildSantaInstructions(baseInput())).not.toContain("line dropped");
    const input = baseInput();
    input.call.resumeTranscript = [
      { role: "santa", text: "How was the game?" },
      { role: "child", text: "We won!" },
    ];
    const text = buildSantaInstructions(input);
    expect(text).toContain("The line dropped a moment ago");
    expect(text).toContain("Alex: We won!");
  });

  it("acknowledges returning callers", () => {
    const input = baseInput();
    input.call.previousCallCount = 2;
    expect(buildSantaInstructions(input)).toContain("called you 2 times before");
  });

  it("handles a nearly empty profile gracefully", () => {
    const input = baseInput();
    input.child = { ...input.child, parents: "", pets: "", sportsAndTeams: "", christmasWishes: "", customFields: [] };
    expect(buildSantaInstructions(input)).toContain("First name: Alex");
  });
});

describe("selection helpers", () => {
  it("orders talking points by priority, then least recently discussed", () => {
    const points = selectTalkingPoints(
      [
        tp({ id: "low", priority: "LOW" }),
        tp({ id: "normal-recent", lastDiscussedAt: new Date("2026-12-09") }),
        tp({ id: "high", priority: "HIGH" }),
        tp({ id: "normal-fresh" }),
      ],
      NOW,
    );
    expect(points.map((p) => p.id)).toEqual(["high", "normal-fresh", "normal-recent", "low"]);
  });

  it("caps and rotates memories, preferring ones not recently referenced", () => {
    const many = Array.from({ length: 15 }, (_, i) => mem({ id: `m${i}`, lastReferencedAt: i < 5 ? new Date("2026-12-09") : null }));
    const chosen = selectMemories(many);
    expect(chosen).toHaveLength(MAX_MEMORIES);
    expect(chosen.slice(0, 10).every((m) => m.lastReferencedAt === null)).toBe(true);
  });
});

describe("time helpers in prompt", () => {
  it("counts days until Christmas in the family's time zone", () => {
    expect(daysUntilChristmas(new Date("2026-12-24T15:00:00Z"), "America/New_York")).toBe(1);
    expect(daysUntilChristmas(new Date("2026-12-25T15:00:00Z"), "America/New_York")).toBe(0);
    expect(daysUntilChristmas(new Date("2026-12-26T15:00:00Z"), "America/New_York")).toBe(364);
  });

  it("builds a wrap-up nudge", () => {
    expect(wrapUpNudge(45)).toMatch(/seconds left/);
  });
});

describe("wish list in Santa's briefing", () => {
  const wish = (o: Partial<import("@/lib/santa/prompt").WishInput>) => ({
    id: Math.random().toString(36).slice(2),
    title: "Wish",
    details: "",
    topWish: false,
    santaCanMention: true,
    approved: true,
    ...o,
  });

  it("includes approved, mentionable wishes with their details, top wishes first", () => {
    const text = buildSantaInstructions(
      baseInput({
        wishes: [wish({ title: "Lego Millennium Falcon" }), wish({ title: "Bauer Vapor skates", details: "size 8, black", topWish: true })],
      }),
    );
    expect(text).toContain("# Christmas wishes");
    expect(text).toContain("[top wish] Bauer Vapor skates (size 8, black)");
    expect(text.indexOf("Bauer Vapor skates (size 8")).toBeLessThan(text.indexOf("Lego Millennium Falcon"));
  });

  it("leaves out wishes heard on calls until a parent keeps them, and hidden ones", () => {
    const text = buildSantaInstructions(
      baseInput({ wishes: [wish({ title: "Unreviewed drone", approved: false }), wish({ title: "Secret surprise bike", santaCanMention: false })] }),
    );
    expect(text).not.toContain("Unreviewed drone");
    expect(text).not.toContain("Secret surprise bike");
    expect(text).toContain("ask what they're hoping for");
  });

  it("asks Santa to confirm specifics and never promise", () => {
    const text = buildSantaInstructions(baseInput());
    expect(text).toMatch(/confirm the specifics/);
    expect(text).toMatch(/Never promise any item/);
  });
});

describe("text-engine briefing and greetings (ElevenLabs)", async () => {
  const { santaGreeting } = await import("@/lib/santa/prompt");
  it("asks for spoken words only and skips the re-greeting", () => {
    const input = baseInput();
    input.call.engine = "text";
    const text = buildSantaInstructions(input);
    expect(text).toMatch(/Write only the exact words Santa says out loud/);
    expect(text).toMatch(/don't greet them again/);
    expect(text).not.toMatch(/# Your voice/);
  });
  it("varies greetings for first-time, returning and reconnecting callers", () => {
    expect(santaGreeting({ name: "Ace", previousCallCount: 0, resuming: false, random: () => 0 })).toContain("finally made it through");
    expect(santaGreeting({ name: "Ace", previousCallCount: 3, resuming: false, random: () => 0.99 })).toContain("Ace");
    expect(santaGreeting({ name: "Ace", previousCallCount: 3, resuming: true, random: () => 0 })).toMatch(/where were we/i);
  });
});

describe("call pacing and goodbyes", async () => {
  const { callPacing, isGoodbye, keepGoingNudge, timeToWrapUpNudge } = await import("@/lib/santa/prompt");
  it("targets 3 to 5 minutes by default and never past the time limit", () => {
    expect(callPacing("MEDIUM", 600)).toEqual({ keepGoingAt: 110, wrapUpAt: 240 });
    expect(callPacing("SHORT", 600)).toEqual({ keepGoingAt: 110, wrapUpAt: 180 });
    expect(callPacing("LONG", 300).wrapUpAt).toBe(250);
    expect(callPacing("MEDIUM", 120).keepGoingAt).toBeNull();
  });
  it("recognizes a child's goodbye without false alarms", () => {
    for (const bye of ["Bye Santa!", "okay bye", "Goodbye!", "I gotta go", "see ya", "talk to you later", "good night Santa"]) expect(isGoodbye(bye)).toBe(true);
    for (const not of ["Merry Christmas Santa!", "I want a new hockey stick", "yes I've been good", "my friend moved away last summer and we said goodbye at the airport which was sad"]) {
      expect(isGoodbye(not)).toBe(false);
    }
  });
  it("tells Santa to keep going early and wrap up later, and to stop after the goodbye", () => {
    expect(keepGoingNudge()).toMatch(/Don't start saying goodbye yet/);
    expect(timeToWrapUpNudge()).toMatch(/start wrapping up/);
    const text = buildSantaInstructions(baseInput());
    expect(text).toMatch(/say ONE short, warm goodbye that ends with the word "bye"/);
    expect(text).toMatch(/reply ONE more time with a very short acknowledgement and bye/);
    expect(text).toMatch(/Never use it with your first goodbye/);
    expect(text).toMatch(/Don't start saying goodbye on your own before you get that note/);
  });
});
