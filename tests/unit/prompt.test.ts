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
    expect(text).toMatch(/AI version of Santa/);
    expect(text).toMatch(/Never claim to secretly watch/);
    expect(text).toMatch(/secrets from parents/);
    expect(text).toMatch(/Never invent memories/);
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
