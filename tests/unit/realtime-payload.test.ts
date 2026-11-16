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
