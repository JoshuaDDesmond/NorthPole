/**
 * How a call ends once goodbyes start:
 *
 *   closing  -> Santa says his goodbye
 *   lastWord -> a short pause so the child can answer ("Bye Santa, love you!");
 *               silence hangs up
 *   final    -> the child answered, Santa gives one short acknowledgement and bye
 *   done     -> hang up once that line has finished
 *
 * The call never hangs up while Santa is talking. "Finished" means he has been quiet for a
 * moment (a pause between sentences doesn't count), and every timer waits for him to stop.
 * The child gets exactly one chance to answer. If Santa's reply to a "goodbye" isn't a
 * goodbye (the child said "see you" mid-chat), the flow cancels and the call carries on.
 */
import { isSantaGoodbye } from "../santa/prompt";

export type GoodbyeState = "idle" | "closing" | "lastWord" | "final" | "done";

export const GOODBYE_TIMING = {
  /** How long the line stays open after Santa's goodbye for the child to answer. */
  lastWordMs: 5_000,
  /** Safety net: hang up if Santa never finishes (or never answers) within this long. */
  fallbackMs: 12_000,
  /** Santa counts as finished only after this much quiet (pauses between sentences are shorter). */
  settleMs: 1_200,
  /** If Santa still seems to be talking when the safety net fires, wait at most this many more rounds. */
  maxFallbackExtensions: 3,
};

export class GoodbyeFlow {
  private _state: GoodbyeState = "idle";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  /** Santa's most recent line since goodbyes started (null = none yet). */
  private santaLineSinceBegin: string | null = null;
  private speaking = false;
  private childAnswered = false;
  private extensions = 0;

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
    this.childAnswered = false;
    this.extensions = 0;
    this.armFallback();
  }

  /** The words of Santa's latest line (transcript). */
  santaLine(text: string) {
    if (this._state !== "idle") this.santaLineSinceBegin = text;
  }

  /** Santa started (or resumed) speaking. */
  santaStarted() {
    this.speaking = true;
    this.clearSettle();
    if (this._state === "lastWord") {
      if (this.childAnswered) {
        // He's answering the child's last word: this is his final line.
        this._state = "final";
        this.armFallback();
      } else {
        // He's still going with his goodbye; wait for him to finish again.
        this._state = "closing";
        this.armFallback();
      }
    } else if (this._state === "done") {
      // He picked back up after a pause: let him finish.
      this._state = "final";
      this.armFallback();
    }
  }

  /** Santa's audio stopped. Counts as finished only if he stays quiet for a moment. */
  santaFinished() {
    this.speaking = false;
    this.clearSettle();
    if (this._state !== "closing" && this._state !== "final") return;
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      if (!this.speaking) this.onSantaDone();
    }, this.timing.settleMs);
  }

  /** The child is talking. During the pause after Santa's goodbye, give Santa time to answer. */
  childSpoke() {
    if (this._state === "lastWord") {
      this.childAnswered = true;
      this.armFallback();
    }
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.clearSettle();
  }

  private onSantaDone() {
    if (this._state === "closing") {
      // Nothing new from Santa yet (e.g. he was cut off mid-sentence): wait for his reply.
      if (this.santaLineSinceBegin === null) return;
      if (!isSantaGoodbye(this.santaLineSinceBegin)) {
        // False alarm: he kept chatting, so the call carries on.
        this.reset();
        return;
      }
      this._state = "lastWord";
      this.arm(this.timing.lastWordMs);
    } else if (this._state === "final") {
      this.finish();
    }
  }

  /** Safety net for a Santa who never finishes or never answers. Never fires mid-sentence. */
  private armFallback() {
    this.arm(this.timing.fallbackMs, () => {
      if (this._state === "closing") {
        const line = this.santaLineSinceBegin;
        // Only a real goodbye (or a Santa who went silent after the child's bye) hangs up.
        if (line !== null && !isSantaGoodbye(line)) {
          this.reset();
          return;
        }
      }
      if (this.speaking && this.extensions < this.timing.maxFallbackExtensions) {
        this.extensions++;
        this.armFallback();
        return;
      }
      this.finish();
    });
  }

  private arm(ms: number, onFire: () => void = () => this.finish()) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      onFire();
    }, ms);
  }

  private finish() {
    if (this._state === "idle") return;
    this.dispose();
    this._state = "done";
    this.hangUp();
  }

  private reset() {
    this.dispose();
    this._state = "idle";
  }

  private clearSettle() {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = null;
  }
}
