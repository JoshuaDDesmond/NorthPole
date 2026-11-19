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
    g.santaFinished(); // "Merry Christmas! Bye now!"
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

  it("recognizes Santa's own goodbye at the end of a line", () => {
    expect(isSantaGoodbye("Merry Christmas, Ronan! Ho ho, bye now!")).toBe(true);
    expect(isSantaGoodbye("Love you too! Bye bye!")).toBe(true);
    expect(isSantaGoodbye("Tell me, what do you want for Christmas this year?")).toBe(false);
  });
});
