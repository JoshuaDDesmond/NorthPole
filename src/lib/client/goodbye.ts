/**
 * How a call ends once goodbyes start:
 *
 *   closing  -> Santa says his goodbye
 *   lastWord -> a short pause so the child can answer ("Bye Santa, love you!");
 *               silence hangs up
 *   final    -> the child answered, Santa gives one short acknowledgement and bye
 *   done     -> hang up as soon as that line finishes
 *
 * The child gets exactly one chance to answer; anything after Santa's last line hangs up.
 * If Santa's reply to a "goodbye" isn't a goodbye (the child said "see you" mid-chat),
 * the flow cancels and the call carries on.
 */
import { isSantaGoodbye } from "../santa/prompt";

export type GoodbyeState = "idle" | "closing" | "lastWord" | "final" | "done";

export const GOODBYE_TIMING = {
  /** How long the line stays open after Santa's goodbye for the child to answer. */
  lastWordMs: 5_000,
  /** Safety net: hang up if Santa never finishes (or never answers) within this long. */
  fallbackMs: 12_000,
  /** Small pause after Santa's last word so it isn't clipped. */
  afterFinalMs: 700,
};

export class GoodbyeFlow {
  private _state: GoodbyeState = "idle";
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Santa's most recent line since goodbyes started (null = none yet). */
  private santaLineSinceBegin: string | null = null;

  constructor(
    private readonly hangUp: () => void,
    private readonly timing = GOODBYE_TIMING,
  ) {}

  get state() {
    return this._state;
  }
  /** True once goodbyes have started; pacing notes should stop. */
  get active() {
    return this._state !== "idle";
  }

  /** The child said goodbye, or Santa started saying his. */
  begin() {
    if (this._state !== "idle") return;
    this._state = "closing";
    this.santaLineSinceBegin = null;
    this.arm(this.timing.fallbackMs, () => {
      // Safety net only applies to a real goodbye (or a Santa who went silent after the child's bye).
      const line = this.santaLineSinceBegin;
      return line === null || isSantaGoodbye(line);
    });
  }

  /** The words of Santa's latest line (transcript). */
  santaLine(text: string) {
    if (this._state !== "idle") this.santaLineSinceBegin = text;
  }

  /** Santa started speaking. */
  santaStarted() {
    if (this._state !== "lastWord") return;
    // He's answering the child's last word: this is his final line.
    this._state = "final";
    this.arm(this.timing.fallbackMs);
  }

  /** Santa stopped speaking (finished, or the child talked over him). */
  santaFinished() {
    if (this._state === "closing") {
      // Nothing new from Santa yet (e.g. he was cut off mid-sentence): wait for his reply.
      if (this.santaLineSinceBegin === null) return;
      if (!isSantaGoodbye(this.santaLineSinceBegin)) {
        // False alarm: he kept chatting, so the call carries on.
        this.dispose();
        this._state = "idle";
        return;
      }
      this._state = "lastWord";
      this.arm(this.timing.lastWordMs);
    } else if (this._state === "final") {
      this._state = "done";
      this.arm(this.timing.afterFinalMs);
    }
  }

  /** The child is talking. During the pause after Santa's goodbye, give Santa time to answer. */
  childSpoke() {
    if (this._state === "lastWord") this.arm(this.timing.fallbackMs);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private arm(ms: number, shouldHangUp: () => boolean = () => true) {
    this.dispose();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!shouldHangUp()) {
        this._state = "idle";
        return;
      }
      this._state = "done";
      this.hangUp();
    }, ms);
  }
}
