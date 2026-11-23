import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoodbyeFlow } from "@/lib/client/goodbye";
import { isSantaGoodbye } from "@/lib/santa/prompt";

const SETTLE = 1_200;

describe("goodbye flow", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function says(g: GoodbyeFlow, line: string, ms = 2_000) {
    g.santaStarted();
    g.santaLine(line);
    vi.advanceTimersByTime(ms);
    g.santaFinished();
  }

  it("hangs up shortly after Santa's goodbye when the child doesn't answer", () => {
    const hangUp = vi.fn();
    const g = new GoodbyeFlow(hangUp);
    g.begin();
    says(g, "Merry Christmas, Ronan! Bye now!");
    vi.advanceTimersByTime(SETTLE + 4_900);
    expect(hangUp).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(hangUp).toHaveBeenCalledTimes(1);
  });

  it("lets the child answer once, then Santa's last word ends the call", () => {
    const hangUp = vi.fn();
    const g = new GoodbyeFlow(hangUp);
    g.begin();
    says(g, "Merry Christmas! Bye now!");
    vi.advanceTimersByTime(SETTLE + 3_000);
    g.childSpoke(); // "Bye Santa, love you!"
    vi.advanceTimersByTime(4_000);
    expect(hangUp).not.toHaveBeenCalled();
    says(g, "Love you too! Bye bye!");
    expect(g.state).toBe("final");
    vi.advanceTimersByTime(SETTLE);
    expect(hangUp).toHaveBeenCalledTimes(1);
  });

  it("never hangs up mid-sentence: a long goodbye outlasts the safety net", () => {
    const hangUp = vi.fn();
    const g = new GoodbyeFlow(hangUp);
    g.begin(); // wrap-up cue: Santa launches into his excuse and goodbye
    g.santaStarted();
    g.santaLine("Oh my, Josh, that's Mrs. Claus calling from the kitchen, the cookies are coming out of the oven and she needs a hand. It was so wonderful talking with you. Merry Christmas, bye now!");
    vi.advanceTimersByTime(20_000); // well past the 12-second safety net, still talking
    expect(hangUp).not.toHaveBeenCalled();
    g.santaFinished();
    vi.advanceTimersByTime(SETTLE + 5_000);
    expect(hangUp).toHaveBeenCalledTimes(1);
  });

  it("a pause between sentences isn't the end of Santa's line", () => {
    const hangUp = vi.fn();
    const g = new GoodbyeFlow(hangUp);
    g.begin();
    g.santaStarted();
    g.santaLine("Well, I'd better run. Merry Christmas, bye now!");
    vi.advanceTimersByTime(2_000);
    g.santaFinished(); // brief gap between sentences
    vi.advanceTimersByTime(500);
    g.santaStarted();
    vi.advanceTimersByTime(3_000);
    expect(g.state).toBe("closing");
    g.santaFinished();
    vi.advanceTimersByTime(SETTLE);
    expect(g.state).toBe("lastWord");
    // ...and if he picks back up during the pause without the child talking, it's still his goodbye.
    g.santaStarted();
    expect(g.state).toBe("closing");
    vi.advanceTimersByTime(1_000);
    g.santaFinished();
    vi.advanceTimersByTime(SETTLE + 5_000);
    expect(hangUp).toHaveBeenCalledTimes(1);
  });

  it("Santa's last word isn't clipped by a pause in it", () => {
    const hangUp = vi.fn();
    const g = new GoodbyeFlow(hangUp);
    g.begin();
    says(g, "Ho ho, bye now!");
    vi.advanceTimersByTime(SETTLE);
    g.childSpoke();
    g.santaStarted();
    g.santaLine("Love you too, kiddo. Bye bye!");
    vi.advanceTimersByTime(1_000);
    g.santaFinished();
    vi.advanceTimersByTime(600); // pause, not done
    g.santaStarted();
    expect(hangUp).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    g.santaFinished();
    vi.advanceTimersByTime(SETTLE);
    expect(hangUp).toHaveBeenCalledTimes(1);
  });

  it("a second interruption doesn't buy another round", () => {
    const hangUp = vi.fn();
    const g = new GoodbyeFlow(hangUp);
    g.begin();
    says(g, "Ho ho, bye now!");
    vi.advanceTimersByTime(SETTLE);
    g.childSpoke();
    g.santaStarted();
    g.childSpoke(); // talks over Santa's last word
    g.santaFinished();
    vi.advanceTimersByTime(SETTLE);
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
    says(g, "Oh, I'll be very busy that night! Now tell me, what's at the top of your list?");
    vi.advanceTimersByTime(SETTLE);
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
    vi.advanceTimersByTime(SETTLE);
    expect(g.state).toBe("closing");
    says(g, "Bye bye, Killian! Merry Christmas!");
    vi.advanceTimersByTime(SETTLE + 5_000);
    expect(hangUp).toHaveBeenCalledTimes(1);
  });

  it("recognizes Santa's own goodbye at the end of a line", () => {
    expect(isSantaGoodbye("Merry Christmas, Ronan! Ho ho, bye now!")).toBe(true);
    expect(isSantaGoodbye("Love you too! Bye bye!")).toBe(true);
    expect(isSantaGoodbye("Tell me, what do you want for Christmas this year?")).toBe(false);
  });
});
