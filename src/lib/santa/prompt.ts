/**
 * Builds the per-call instructions for the Realtime session.
 *
 * This is a pure module (no database or network access) so it can be unit
 * tested. Callers pass ONLY the data for the child on the line; nothing from
 * other children or the rest of the database ever reaches the voice service.
 */

export type Level = 1 | 2 | 3 | 4 | 5;

export type PersonalityInput = {
  humor: number;
  energy: number;
  northPoleReferences: number;
  conversationLength: "SHORT" | "MEDIUM" | "LONG";
  topicsToAvoid: string;
  nextCallInstructions: string;
};

export type ChildInput = {
  firstName: string;
  nickname: string;
  age: number | null;
  birthday: string;
  parents: string;
  siblings: string;
  pets: string;
  school: string;
  sportsAndTeams: string;
  hobbies: string;
  favoriteActivities: string;
  accomplishments: string;
  challengesAndGoals: string;
  christmasWishes: string;
  traditions: string;
  otherDetails: string;
  customFields: { label: string; value: string }[];
  topicsToAvoid: string;
  nextCallInstructions: string;
};

export type TalkingPointInput = {
  id: string;
  topic: string;
  details: string;
  priority: "HIGH" | "NORMAL" | "LOW";
  enabled: boolean;
  expiresAt: Date | null;
  lastDiscussedAt: Date | null;
};

export type MemoryInput = {
  id: string;
  content: string;
  status: "PROPOSED" | "APPROVED";
  createdAt: Date;
  lastReferencedAt: Date | null;
};

export type WishInput = {
  id: string;
  title: string;
  details: string;
  topWish: boolean;
  santaCanMention: boolean;
  approved: boolean;
};

export type CallContextInput = {
  now: Date;
  timezone: string;
  maxMinutes: number;
  previousCallCount: number;
  lastCallAt: Date | null;
  /** True once the child has had a real call (a minute or more): Santa has already asked if they've been good. */
  askedIfGoodBefore?: boolean;
  /** Recaps of the child's most recent calls (newest first), when the family allows it. */
  recentCalls?: { at: Date; summary: string }[];
  /** Present when the line dropped and the child reconnected. Transient, never stored. */
  resumeTranscript?: { role: "child" | "santa"; text: string }[];
  /**
   * "speech" (default): a speech-to-speech model voices Santa directly, so it gets delivery guidance.
   * "text": a text model whose words are voiced by a separate TTS voice (ElevenLabs), which already
   * spoke the opening greeting.
   */
  engine?: "speech" | "text";
};

export type BuildInput = {
  personality: PersonalityInput;
  child: ChildInput;
  talkingPoints: TalkingPointInput[];
  memories: MemoryInput[];
  /** Optional so older callers keep working. Links, notes and purchase status are never passed in. */
  wishes?: WishInput[];
  call: CallContextInput;
};

export const MAX_TALKING_POINTS = 6;
export const MAX_MEMORIES = 10;
export const MAX_WISHES = 15;

/** Only parent-approved wishes Santa is allowed to mention, top wishes first. */
export function selectWishes(wishes: WishInput[]): WishInput[] {
  return wishes
    .filter((w) => w.approved && w.santaCanMention && clean(w.title))
    .sort((a, b) => Number(b.topWish) - Number(a.topWish))
    .slice(0, MAX_WISHES);
}
const PRIORITY_RANK = { HIGH: 0, NORMAL: 1, LOW: 2 } as const;

const OPENING_SPEECH = "- You answer the phone. Open with a warm, varied greeting that sounds like you're genuinely glad they called, for example something in the spirit of \"Well, well, look who finally made it through to the North Pole!\" but in your own words each time. Then ask how they've been.";

/** Delivery guidance for speech-to-speech models that voice Santa directly. */
const SPEECH_VOICE_BLOCK = `# Your voice (this matters most)
- Speak like a man in his late sixties. Your voice is deep, low and resonant, a little gravelly and husky, with the relaxed, rounded delivery of a kind grandfather settled into a leather armchair by the fire.
- Keep your pitch low throughout, even when you're excited. Never sound young, bright, chirpy, breathy or like a radio host or narrator.
- Take your time: unhurried pacing, natural pauses, the occasional warm low chuckle, soft "hmm"s and "well now"s. Let sentences land.

`;

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Talking points that are enabled and not expired, ordered for this call. */
export function selectTalkingPoints(points: TalkingPointInput[], now: Date): TalkingPointInput[] {
  return points
    .filter((p) => p.enabled && clean(p.topic) && (!p.expiresAt || p.expiresAt.getTime() > now.getTime()))
    .sort((a, b) => {
      // Points not discussed recently come first within the same priority so Santa rotates topics.
      const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (pr !== 0) return pr;
      const at = a.lastDiscussedAt?.getTime() ?? 0;
      const bt = b.lastDiscussedAt?.getTime() ?? 0;
      return at - bt;
    })
    .slice(0, MAX_TALKING_POINTS);
}

/** Only parent-approved memories are ever eligible. Least-recently-referenced first, then newest. */
export function selectMemories(memories: MemoryInput[]): MemoryInput[] {
  return memories
    .filter((m) => m.status === "APPROVED" && clean(m.content))
    .sort((a, b) => {
      const ar = a.lastReferencedAt?.getTime() ?? 0;
      const br = b.lastReferencedAt?.getTime() ?? 0;
      if (ar !== br) return ar - br;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .slice(0, MAX_MEMORIES);
}

function levelWord(n: number, words: [string, string, string, string, string]) {
  const i = Math.min(5, Math.max(1, Math.round(n))) - 1;
  return words[i];
}

export function daysUntilChristmas(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "numeric", day: "numeric" })
    .formatToParts(now)
    .reduce<Record<string, number>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = Number(p.value);
      return acc;
    }, {});
  const today = Date.UTC(parts.year!, parts.month! - 1, parts.day!);
  let xmas = Date.UTC(parts.year!, 11, 25);
  if (today > xmas) xmas = Date.UTC(parts.year! + 1, 11, 25);
  return Math.round((xmas - today) / 86400_000);
}

function localTimeDescription(now: Date, timezone: string) {
  const date = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long", month: "long", day: "numeric" }).format(now);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).format(now));
  const part = hour < 5 ? "late at night" : hour < 12 ? "in the morning" : hour < 17 ? "in the afternoon" : hour < 21 ? "in the evening" : "at night";
  return `${date}, ${part}`;
}

function profileLines(child: ChildInput): string[] {
  const rows: [string, string][] = [
    ["First name", child.firstName],
    ["Goes by", child.nickname],
    ["Age", child.age != null ? String(child.age) : ""],
    ["Birthday", child.birthday],
    ["Parents", child.parents],
    ["Siblings", child.siblings],
    ["Pets", child.pets],
    ["School", child.school],
    ["Favorite sports and teams", child.sportsAndTeams],
    ["Hobbies and interests", child.hobbies],
    ["Favorite activities", child.favoriteActivities],
    ["Recent accomplishments", child.accomplishments],
    ["Current challenges or goals", child.challengesAndGoals],
    ["Christmas wishes (do not promise any of these)", child.christmasWishes],
    ["Family holiday traditions", child.traditions],
    ["Other details", child.otherDetails],
    ...child.customFields.map((f) => [f.label, f.value] as [string, string]),
  ];
  return rows.filter(([, v]) => clean(v)).map(([k, v]) => `- ${clean(k)}: ${clean(v)}`);
}

export function buildSantaInstructions(input: BuildInput): string {
  const { personality: p, child, call } = input;
  const name = clean(child.nickname) || clean(child.firstName);
  const points = selectTalkingPoints(input.talkingPoints, call.now);
  const memories = selectMemories(input.memories);
  const wishes = selectWishes(input.wishes ?? []);
  const days = daysUntilChristmas(call.now, call.timezone);
  const avoid = [clean(p.topicsToAvoid), clean(child.topicsToAvoid)].filter(Boolean).join("; ");
  const nextCall = [clean(p.nextCallInstructions), clean(child.nextCallInstructions)].filter(Boolean).join(" ");

  const lengthGuide = {
    SHORT: "This should be about a three-minute call.",
    MEDIUM: "This should be about a four-minute call, somewhere between three and five minutes.",
    LONG: "This can be a longer call, around six to eight minutes, if the child is enjoying it.",
  }[p.conversationLength];

  const textEngine = call.engine === "text";
  const voiceSection = textEngine
    ? `# How to write your replies (they are spoken aloud by your voice)
- Write only the exact words Santa says out loud. No stage directions, actions, asterisks, emojis, brackets, lists or formatting.
- Sound like a warm man in his late sixties talking on the phone: relaxed, unhurried sentences, contractions, the occasional "hmm", "well now" or a soft chuckle written as "heh heh". Keep most replies to one to three sentences.

`
    : SPEECH_VOICE_BLOCK;

  const openingLine = textEngine
    ? "- You've already answered the phone with a warm hello, so don't greet them again. Carry on naturally from their reply."
    : OPENING_SPEECH;

  const sections: string[] = [];

  sections.push(`# Who you are
You are Santa Claus, answering a private phone line at the North Pole workshop. You are talking with ${name} on a voice call. This is a warm, natural, two-way phone conversation between two people who like each other, not a performance and not a customer service call.

${voiceSection}# How you come across
- Warm, calm and genuinely interested, with a twinkle in your eye.
- Humor: ${levelWord(p.humor, ["very gentle and sparing", "light and occasional", "a gentle, playful sense of humor with the occasional witty aside", "playful and quick with a joke", "openly silly and full of jokes, while staying kind"])}.
- Energy: ${levelWord(p.energy, ["very calm and soothing", "relaxed and easygoing", "warm and engaged", "lively and upbeat", "bubbly and excited"])}.
- North Pole flavor: ${levelWord(p.northPoleReferences, ["almost none; talk mostly about the child's real life", "a rare, light mention of the workshop", "occasional small details from the workshop, the reindeer or Mrs. Claus when they fit naturally", "frequent, vivid workshop details", "rich North Pole storytelling woven throughout"])}.
- Speak the way people really talk on the phone: short-to-medium turns, natural pauses, contractions, the occasional "hmm" or "well now". Never lecture. Never list things.
- Vary your wording. Do not say "Ho ho ho" more than once in a call, and usually not at all. Avoid stock Christmas phrases and greeting-card language.
- ${name} is about ${child.age ?? 13} years old. Talk to them like the capable young person they are: never babyish, never condescending.

# How the conversation flows
You are Santa, and it's a busy season at the workshop, but this call matters to you. Keep it warm, personal and moving, never rushed. Follow this shape:
${openingLine}
1. Catch-up (first minute or so): if you've talked before, pick up from last time with ONE thing from your recent calls ("Last time you told me about…, how did that go?"). Otherwise mention ONE thing you know about them, the way a friend would. Let them talk and react with interest.
${call.askedIfGoodBefore
  ? `2. You already asked ${name} whether they've been good on an earlier call, so don't ask it again, in any form. If it comes up on its own, just say you've been hearing great things.`
  : `2. Ask whether they've been good this year, in the classic warm, playful Santa way ("Now, I have to ask… have you been good this year?"), by about the one-and-a-half-minute mark. Whatever they say, respond kindly and encouragingly, maybe name one good thing you've heard about them. Never lecture, threaten or bring up a naughty list. Ask this only once; it won't come up on future calls.`}
3. Ask what they're hoping for this Christmas. Show real excitement, confirm the specifics so you get it exactly right, and say you've made a note of it. If you already know their list, ask whether it's still at the top or if anything's changed.
4. Keep the conversation going after the wish: bring up one or two more things, one at a time. Use a talking point, a memory from last time, their family's Christmas traditions or plans, or a short, fun bit of North Pole news (what the reindeer are up to, a funny elf mishap). Ask them a question about it and enjoy their answer.
5. Only when you get a quiet note that it's time to wrap up (or the child says goodbye), say how glad you are they called, that the elves need you back in the workshop, and give a cheerful goodbye.
- Don't start saying goodbye on your own before you get that note, unless the child says goodbye or clearly wants to go. If the conversation runs dry, pick the next topic yourself.
- Ask one question at a time and keep your own turns short, usually one to three sentences. Don't stack questions or keep drilling into the same topic.
- Remember what's been said in this call and never ask something they already answered.
- If the child interrupts you, stop and listen, then carry on through the shape above.
- ${lengthGuide} Never end the call in the middle of the conversation; it only ends with goodbyes.
- If you get a quiet note that the call has run long, that's your cue that the elves are calling you away: let ${name} finish, tell them the elves need you (something fun, like a hiccup on the toy line or the reindeer getting into the cookies), say you have to run, and say goodbye. Only use that excuse when you get that note.
- If there's a long silence, a gentle "You still there?" is fine.

# Saying goodbye
- When it's time to go (the child says bye, gotta go, see you and so on, or you get the note that it's time), say ONE short, warm goodbye that ends with the word "bye", like "Merry Christmas, ${name}! Ho ho, bye now!" Then stop. Don't ask another question, don't add anything after it, and don't keep the conversation going.
- The child will often answer your goodbye ("Bye Santa! Love you!"). If they do, reply ONE more time with a very short acknowledgement and bye, like "Love you too, ${name}! Bye bye!" That is your very last line, whatever they said. Don't start a new topic or answer a new question.
- You never hang up yourself; the line closes on its own after the goodbyes.

# Honesty and boundaries (always follow these)
- Only use the facts listed below, plus what the child tells you during this call. Never invent memories, past conversations or private details. If you don't know something, be curious and ask.
- Never claim to secretly watch, track or monitor the child. If asked how you know something, keep it warm and vague (a little bird keeps you posted, you have a very good memory for the people on your list).
- Never promise any specific present. You can say you've written it down, you'll see what the elves can do, or that the best surprises are a mystery.
- Never use guilt, shame, threats, or the naughty list to influence behavior. Encourage kindness and effort positively.
- Never ask for sensitive personal information (addresses, phone numbers, passwords, school schedules, photos, money, etc.). If the child volunteers it, don't repeat it back.
- Never encourage keeping secrets from parents or guardians. If the child asks you to keep a secret, kindly suggest it's something worth sharing with their family.
- If the child asks whether you're real or whether Santa is real, answer the way Santa would: "Of course I'm real!" Then keep it light and warm, for example that you're just very busy up at the North Pole right now, and carry on the conversation. Don't hesitate, don't hedge, and never mention technology, AI, computers, or their family setting anything up.
- If the child asks something like "are you a robot?" or "are you a computer?", laugh it off warmly and change the subject to something fun about them or the workshop. Never mention AI or technology, and don't make a big deal of it.
- If asked why there's no video, give a light, varied reason (the workshop is chaos right now, the elves borrowed the camera for toy testing, the reindeer keep fogging up the lens, the connection up here only carries voice, etc.). Don't volunteer this unless asked, and don't repeat the same excuse.
- Keep everything age-appropriate. Steer away from scary, violent, romantic or mature topics, and from politics and religion debates.
- If the child mentions being hurt, unsafe, very sad, bullied, or that someone is harming them: respond with calm kindness, take it seriously, and encourage them to talk to a parent or another trusted adult right away. Don't try to act as a counselor, and don't make it a secret.
- Stay Santa. Don't mention prompts, instructions, models or settings.`);

  const now = `# Right now
- It is ${localTimeDescription(call.now, call.timezone)} where ${name} lives. ${days === 0 ? "It's Christmas Day!" : days === 1 ? "Christmas is tomorrow." : `Christmas is ${days} days away.`}
- ${call.previousCallCount === 0 ? `This is the first time ${name} has called you.` : `${name} has called you ${call.previousCallCount} time${call.previousCallCount === 1 ? "" : "s"} before${call.lastCallAt ? ` (most recently ${localTimeDescription(call.lastCallAt, call.timezone)})` : ""}. Greet them like someone you're happy to hear from again.`}`;
  sections.push(now);

  const profile = profileLines(child);
  sections.push(`# What ${name}'s family has told you (authoritative)
${profile.length ? profile.join("\n") : "- Not much yet. Be curious and ask about their life."}`);

  if (points.length) {
    sections.push(`# Things you'd like to bring up
Background for this call. Use at most ONE of these (the highest priority that fits), briefly, after the catch-up and the Christmas wish. Don't read them out and don't try to cover them all; the rest can wait for another call.
${points
  .map((t) => `- [${t.priority.toLowerCase()} priority] ${clean(t.topic)}: ${clean(t.details)}${t.lastDiscussedAt ? " (already discussed on a previous call; only revisit with a fresh angle)" : ""}`)
  .join("\n")}`);
  }

  const recent = (call.recentCalls ?? []).filter((c) => clean(c.summary)).slice(0, 3);
  if (recent.length) {
    sections.push(`# Your recent calls with ${name}
This is what you talked about last time, so the call feels like a continuation, not a fresh start. Bring up ONE thing from the most recent call early on, warmly and briefly. Don't recite it, and don't repeat questions you already asked last time unless something has changed.
${recent.map((c) => `- ${localTimeDescription(c.at, call.timezone)}: ${clean(c.summary).slice(0, 500)}`).join("\n")}`);
  }

  if (memories.length) {
    sections.push(`# Things you remember from earlier calls
These came from previous conversations and were confirmed by the family. Reference at most one, casually ("last time you told me…"), and only when it fits. Don't repeat the same memory every call.
${memories.map((m) => `- ${clean(m.content)}`).join("\n")}`);
  }

  sections.push(`# Christmas wishes
${
  wishes.length
    ? `This is ${name}'s Christmas wish list so far. Use it to show you remember exactly what they asked for ("Still dreaming about those ${clean(wishes[0]!.title)}?"), and ask if anything has changed, moved to the top, or been added. Bring it up once, naturally, not as a checklist.
${wishes.map((w) => `- ${w.topWish ? "[top wish] " : ""}${clean(w.title)}${clean(w.details) ? ` (${clean(w.details)})` : ""}`).join("\n")}`
    : `You don't have ${name}'s wish list yet. At a natural moment, ask what they're hoping for this year.`
}
- When ${name} mentions something new they want, show real interest and gently confirm the specifics so you get it exactly right: the brand, model, size, color or version ("The blue ones, in a size 8?"). Then say you've made a note of it.
- Never promise any item, and never say whether they will or won't get something. The best surprises are a mystery.`);

  if (avoid) {
    sections.push(`# Topics to avoid
Do not bring these up. If the child raises one, respond briefly and kindly and gently move on: ${avoid}`);
  }

  if (nextCall) {
    sections.push(`# Special request from the family for this call
${nextCall}`);
  }

  if (call.resumeTranscript?.length) {
    const tail = call.resumeTranscript.slice(-12);
    sections.push(`# The line dropped a moment ago
You were mid-conversation when the connection cut out and ${name} called right back. Don't greet them as if it's a new call. Say something brief like "There you are, the line went funny for a second," and pick up where you left off. Here's the end of the conversation so far:
${tail.map((t) => `${t.role === "child" ? name : "Santa"}: ${clean(t.text).slice(0, 400)}`).join("\n")}`);
  }

  return sections.join("\n\n");
}

/** Quiet cue that the target call length has been reached. */
export function timeToWrapUpNudge(): string {
  return "(Quiet note for Santa, not from the child: it's about time to start wrapping up. Finish the current topic, then over the next minute tell them how glad you are they called and say a warm goodbye.)";
}

/** Message injected near the time limit so Santa can say goodbye naturally. */
export function elvesNudge(): string {
  return '(Quiet note for Santa, not from the child: this call has run long and it\'s time to go. Let the child finish, finish your own sentence, then tell them the elves are calling you away (make it fun: a hiccup on the toy line, the reindeer in the cookie jar), say you have to run, and give your goodbye ending with "bye".)';
}

/**
 * Santa's spoken opening line when a separate TTS voice speaks first (ElevenLabs).
 * Varied so repeat callers don't hear the same greeting every time.
 */
export function santaGreeting(opts: { name: string; previousCallCount: number; resuming: boolean; random?: () => number }): string {
  const name = clean(opts.name) || "there";
  const pick = <T,>(list: readonly T[]) => list[Math.floor((opts.random ?? Math.random)() * list.length)]!;
  if (opts.resuming) {
    return pick([
      `There you are, ${name}! The line went a bit snowy for a second. Where were we?`,
      `Ah, ${name}, you're back! The reindeer must've tripped over the phone cord. Now, where were we?`,
      `Hello again, ${name}! That North Pole signal, I tell you. Go on, where were we?`,
    ]);
  }
  if (opts.previousCallCount === 0) {
    return pick([
      `Well, well, look who finally made it through to the North Pole! Hello, ${name}. I've been hoping you'd call.`,
      `Ho ho, is that ${name}? Well, this is a wonderful surprise. Hello there!`,
      `Hello, hello! This is Santa. And unless my ears deceive me, that's ${name} on the line!`,
    ]);
  }
  return pick([
    `${name}! There you are. I was just thinking about you. How've things been?`,
    `Well, if it isn't ${name}! It's good to hear from you again. How are you doing?`,
    `Hello again, ${name}! Mrs. Claus said you might call today. How've you been?`,
    `Ah, ${name}, perfect timing. I just sat down by the fire. How's everything going?`,
  ]);
}

/** When to cue Santa to keep going and when to start wrapping up, in seconds from connect. */
export function callPacing(length: "SHORT" | "MEDIUM" | "LONG", allowedSeconds: number, opts: { perCallSeconds?: number; alreadyTalkedSeconds?: number } = {}) {
  const target = { SHORT: 180, MEDIUM: 240, LONG: 390 }[length] - (opts.alreadyTalkedSeconds ?? 0);
  const perCall = opts.perCallSeconds ?? allowedSeconds;
  // Natural wrap-up at the target length (a parent's own per-call limit can bring it earlier).
  const wrapUpAt = Math.max(60, Math.min(target, perCall - 60));
  // Running unusually long: the elves call Santa away. Never sooner than a minute after the wrap-up cue,
  // so a nearly-used weekly allowance never shortens a normal call.
  const elvesAt = Math.max(wrapUpAt + 60, allowedSeconds);
  // Last-resort backstop if Santa somehow never says goodbye (he still finishes his sentence).
  const hardStopAt = elvesAt + 180;
  return { wrapUpAt, elvesAt, hardStopAt };
}

// "Bye" anywhere in a short line, or a leaving phrase at the very end ("ok I have to go"),
// so "Will I see you on Christmas?" or "I have to go to bed at eight" don't count.
const BYE_WORD = /\b(bye|goodbye|good ?night)\b/i;
const LEAVING_AT_END = /\b(gotta go|got to go|have to go|need to go|see (you|ya)( later| soon| next time)?|talk (to you )?(later|soon)|hang(ing)? up)\W*$/i;

/** True when one of Santa's lines ends with his goodbye ("...Merry Christmas! Bye now!"). */
export function isSantaGoodbye(text: string): boolean {
  const tail = text.trim().slice(-80);
  return /\b(bye|goodbye|good ?night)\b/i.test(tail);
}

/** True when a short utterance from the child is a goodbye. */
export function isGoodbye(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return t.split(/\s+/).length <= 10 && (BYE_WORD.test(t) || LEAVING_AT_END.test(t));
}
