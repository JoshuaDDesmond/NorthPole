import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoodbyeFlow } from "@/lib/client/goodbye";
import { isSantaGoodbye } from "@/lib/santa/prompt";

describe("goodbye flow", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("hangs up shortly after Santa's goodbye when the child doesn't answer", () => {
    const hangUp = vi.fn();
    const g = new GoodbyeFlow(hangUp);
    g.begin();
    g.santaStarted();
    g.santaLine("Merry Christmas, Ronan! Bye now!");
    g.santaFinished();
    vi.advanceTimersByTime(4_900);
    expect(hangUp).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(hangUp).toHaveBeenCalledTimes(1);
  });

  it("lets the child answer once, then Santa's last word ends the call", () => {
    const hangUp = vi.fn();
    const g = new GoodbyeFlow(hangUp);
    g.begin();
    g.santaLine("Merry Christmas! Bye now!");
    g.santaFinished();
    vi.advanceTimersByTime(3_000);
    g.childSpoke(); // "Bye Santa, love you!"
    vi.advanceTimersByTime(4_000); // past the 5s pause: still waiting for Santa
    expect(hangUp).not.toHaveBeenCalled();
    g.santaStarted(); // "Love you too! Bye bye!"
    expect(g.state).toBe("final");
    g.santaFinished();
    vi.advanceTimersByTime(700);
    expect(hangUp).toHaveBeenCalledTimes(1);
  });

  it("a second interruption doesn't buy another round", () => {
    const hangUp = vi.fn();
    const g = new GoodbyeFlow(hangUp);
    g.begin();
    g.santaLine("Ho ho, bye now!");
    g.santaFinished();
    g.childSpoke();
    g.santaStarted();
    g.childSpoke(); // talks over Santa's last word
    g.santaFinished();
    vi.advanceTimersByTime(700);
    expect(hangUp).toHaveBeenCalledTimes(1);
  });

  it("never hangs up before goodbyes start, and has a safety net if Santa goes quiet", () => {
    const hangUp = vi.fn();
    const g = new GoodbyeFlow(hangUp);
    g.santaStarted();
    g.santaFinished();
    g.childSpoke();
    vi.advanceTimersByTime(60_000);
    expect(hangUp).not.toHaveBeenCalled();
    g.begin();
    vi.advanceTimersByTime(12_000);
    expect(hangUp).toHaveBeenCalledTimes(1);
  });

  it("a false alarm (Santa just keeps chatting) cancels and never hangs up", () => {
    const hangUp = vi.fn();
    const g = new GoodbyeFlow(hangUp);
    g.begin(); // child: "Will I see you later?"
    g.santaStarted();
    g.santaLine("Oh, I'll be very busy that night! Now tell me, what's at the top of your list?");
    g.santaFinished();
    expect(g.state).toBe("idle");
    vi.advanceTimersByTime(60_000);
    expect(hangUp).not.toHaveBeenCalled();
  });

  it("a long non-goodbye answer doesn't trip the safety net", () => {
    const hangUp = vi.fn();
    const g = new GoodbyeFlow(hangUp);
    g.begin();
    g.santaStarted();
    g.santaLine("Well now, let me tell you all about the reindeer games we had this morning...");
    vi.advanceTimersByTime(13_000); // still talking
    expect(hangUp).not.toHaveBeenCalled();
    expect(g.state).toBe("idle");
  });

  it("waits for Santa's actual reply if he was cut off when goodbyes began", () => {
    const hangUp = vi.fn();
    const g = new GoodbyeFlow(hangUp);
    g.begin();
    g.santaFinished(); // old line interrupted, no new line yet
    expect(g.state).toBe("closing");
    g.santaLine("Bye bye, Killian! Merry Christmas!");
    g.santaFinished();
    vi.advanceTimersByTime(5_000);
    expect(hangUp).toHaveBeenCalledTimes(1);
  });

  it("recognizes Santa's own goodbye at the end of a line", () => {
    expect(isSantaGoodbye("Merry Christmas, Ronan! Ho ho, bye now!")).toBe(true);
    expect(isSantaGoodbye("Love you too! Bye bye!")).toBe(true);
    expect(isSantaGoodbye("Tell me, what do you want for Christmas this year?")).toBe(false);
  });
});
