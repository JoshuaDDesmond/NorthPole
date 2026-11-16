import { describe, expect, it } from "vitest";
import { buildSessionPayload, safetyIdentifier } from "@/lib/openai/realtime";

describe("realtime session payload", () => {
  it("configures voice activity detection with barge-in and the chosen voice", () => {
    const p = buildSessionPayload({ instructions: "Be Santa", voice: "cedar", transcribeChild: true });
    expect(p.type).toBe("realtime");
    expect(p.instructions).toBe("Be Santa");
    expect(p.audio.output.voice).toBe("cedar");
    expect(p.audio.input.turn_detection).toMatchObject({ create_response: true, interrupt_response: true });
    expect(p.audio.input.transcription).not.toBeNull();
    expect(p.audio.output.speed).toBe(0.9);
  });

  it("uses the parent's speaking pace within safe bounds", () => {
    expect(buildSessionPayload({ instructions: "x", voice: "ash", transcribeChild: false, speed: 0.82 }).audio.output.speed).toBe(0.82);
    expect(buildSessionPayload({ instructions: "x", voice: "ash", transcribeChild: false, speed: 3 }).audio.output.speed).toBe(1.2);
  });

  it("disables child transcription when memory suggestions are off", () => {
    const p = buildSessionPayload({ instructions: "x", voice: { id: "voice_123" }, transcribeChild: false });
    expect(p.audio.input.transcription).toBeNull();
    expect(p.audio.output.voice).toEqual({ id: "voice_123" });
  });

  it("derives a stable, non-identifying safety identifier", () => {
    const a = safetyIdentifier("fam1", "child1");
    expect(a).toBe(safetyIdentifier("fam1", "child1"));
    expect(a).not.toBe(safetyIdentifier("fam1", "child2"));
    expect(a).not.toContain("child1");
  });
});

describe("OpenAI key format checks", async () => {
  const { describeKeyFormat } = await import("@/lib/openai/realtime");
  it("flags an Anthropic key pasted by mistake", () => {
    expect(describeKeyFormat("sk-ant-api03-abc")).toMatch(/Anthropic \(Claude\) key/);
  });
  it("flags keys that aren't OpenAI secret keys", () => {
    expect(describeKeyFormat("pk_live_123")).toMatch(/doesn't look like an OpenAI secret key/);
    expect(describeKeyFormat("sk-proj-abc def")).toMatch(/spaces/);
  });
  it("accepts OpenAI secret keys and never echoes them", () => {
    expect(describeKeyFormat("sk-proj-abc123")).toBeNull();
    expect(describeKeyFormat("sk-ant-SECRET")).not.toContain("SECRET");
  });
});
