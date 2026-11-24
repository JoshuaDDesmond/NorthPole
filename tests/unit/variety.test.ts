import { describe, expect, it } from "vitest";
import { buildSantaInstructions, CALL_OPENERS, decodePlanOpener, encodePlan, planCall, santaGreeting, type BuildInput } from "@/lib/santa/prompt";

const NOW = new Date("2026-12-10T23:00:00Z");
function input(previousCallCount: number, plan?: ReturnType<typeof planCall>): BuildInput {
  return {
    personality: { humor: 3, energy: 3, northPoleReferences: 3, conversationLength: "MEDIUM", topicsToAvoid: "", nextCallInstructions: "" },
    child: {
      firstName: "Ronan", nickname: "", age: 13, birthday: "", parents: "", siblings: "", pets: "", school: "", sportsAndTeams: "Hockey", hobbies: "", favoriteActivities: "",
      accomplishments: "", challengesAndGoals: "", christmasWishes: "", traditions: "", otherDetails: "", customFields: [], topicsToAvoid: "", nextCallInstructions: "",
    } as BuildInput["child"],
    talkingPoints: [],
    memories: [],
    wishes: [{ id: "w1", title: "Bauer skates", details: "size 8", topWish: true, santaCanMention: true, approved: true }] as BuildInput["wishes"],
    call: { now: NOW, timezone: "America/New_York", maxMinutes: 10, previousCallCount, lastCallAt: null, askedIfGoodBefore: previousCallCount > 0, plan, engine: "text" },
  };
}

describe("keeping calls fresh", () => {
  it("never opens a call the same way as the last one", () => {
    for (let last = 0; last < CALL_OPENERS.length; last++) {
      for (const r of [0, 0.2, 0.5, 0.8, 0.99]) {
        expect(planCall({ avoidOpener: last, random: () => r }).opener).not.toBe(last);
      }
    }
    const plan = planCall({ random: () => 0.3 });
    expect(decodePlanOpener(encodePlan(plan))).toBe(plan.opener);
    expect(decodePlanOpener(null)).toBeNull();
  });

  it("uses a varied plan instead of the fixed script on repeat calls", () => {
    const a = buildSantaInstructions(input(4, { opener: 3, extras: [0], wishCheckIn: false }));
    const b = buildSantaInstructions(input(4, { opener: 5, extras: [2, 6], wishCheckIn: true }));
    expect(a).toMatch(/Every call with Ronan should feel different/);
    expect(a).toContain(CALL_OPENERS[3]);
    expect(b).toContain(CALL_OPENERS[5]);
    expect(a).not.toMatch(/Follow this shape/);
    expect(a).toMatch(/Don't bring up the wish list on this call unless Ronan does/);
    expect(b).toMatch(/Bring it up once on this call/);
    expect(a).not.toMatch(/have you been good this year\?/);
  });

  it("keeps the classic first-call shape for a brand-new caller", () => {
    const first = buildSantaInstructions(input(0));
    expect(first).toMatch(/Follow this shape/);
    expect(first).toMatch(/have you been good this year\?/);
  });

  it("a personal opener asks about one specific thing the family filled in, never a guess", () => {
    const base = input(3, { opener: CALL_OPENERS.indexOf("PERSONAL"), extras: [0], wishCheckIn: false, pick: 0 });
    base.child = { ...base.child, sportsAndTeams: "", pets: "A golden retriever named Moose" };
    const text = buildSantaInstructions(base);
    expect(text).toMatch(/Ask about this, something the family told you: "Pets: A golden retriever named Moose"/);
    expect(text).not.toMatch(/a team or sport/);
    const empty = input(3, { opener: CALL_OPENERS.indexOf("PERSONAL"), extras: [0], wishCheckIn: false, pick: 0.5 });
    empty.child = { ...empty.child, sportsAndTeams: "" };
    expect(buildSantaInstructions(empty)).toContain(CALL_OPENERS[5]);
    expect(buildSantaInstructions(empty)).not.toContain("PERSONAL");
  });

  it("varies the hello on repeat calls", () => {
    const hellos = new Set(Array.from({ length: 8 }, (_, i) => santaGreeting({ name: "Ronan", previousCallCount: 3, resuming: false, random: () => i / 8 })));
    expect(hellos.size).toBe(8);
  });
});

describe("pictures sent to Santa", () => {
  it("tells Santa about new pictures in the briefing and live during a call", async () => {
    const { photoNote } = await import("@/lib/santa/prompt");
    const text = buildSantaInstructions({ ...input(2), photos: [{ at: NOW, description: "A poster of a red sleigh." }] });
    expect(text).toMatch(/# Pictures Ronan sent you/);
    expect(text).toContain("A poster of a red sleigh.");
    expect(buildSantaInstructions(input(2))).not.toMatch(/# Pictures/);
    expect(photoNote("Ronan", "A poster of a red sleigh.")).toMatch(/Ronan just sent you a picture.*A poster of a red sleigh\./);
    expect(photoNote("Ronan", "")).toMatch(/ask them to tell you all about it/);
    expect(photoNote("Ronan", "A poster of an animatronic bear.", "my Five Nights at Freddy's poster")).toMatch(/Ronan says it's "my Five Nights at Freddy's poster"\. It shows: A poster/);
    const withCaption = buildSantaInstructions({ ...input(2), photos: [{ at: NOW, description: "A poster.", caption: "my Five Nights at Freddy's poster" }] });
    expect(withCaption).toContain(`Ronan says it's "my Five Nights at Freddy's poster"`);
  });
});
