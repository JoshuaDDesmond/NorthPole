/**
 * End-to-end checks for the ElevenLabs voice engine.
 *
 * Runs the production build with ELEVENLABS_API_KEY set and the server pointed
 * at a local mock of the ElevenLabs API, then verifies agent setup, call
 * tokens, Santa's per-call briefing and access control. The live audio
 * connection itself needs real ElevenLabs servers, so the browser check here
 * verifies that a failed connection is reported honestly.
 *
 * Usage:  npm run build && npm run test:e2e:elevenlabs
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const pg = require("pg");

const ROOT = new URL("../../", import.meta.url).pathname;
const PORT = 3110;
const MOCK_PORT = 4020;
const BASE = `http://localhost:${PORT}`;
const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://northpole:northpole@localhost:5432/northpole_test?schema=public";
const EL_KEY = "sk_test_elevenlabs_key_never_in_browser";
const DEFAULT_VOICE = "VoiceDefault123";

let passed = 0;
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${e?.message ?? e}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const db = new pg.Client({ connectionString: TEST_DB });
await db.connect();
await db.query(`TRUNCATE "Family","RateLimitBucket" CASCADE`);

/* ------------------------------ Mock ElevenLabs ------------------------------ */
const mock = { agents: new Map(), tokens: [], requests: [] };
let mockFailCreate = false;
const mockServer = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || "{}") : null;
  mock.requests.push({ method: req.method, url: req.url, body });
  const send = (status, data) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(data));
  if (req.headers["xi-api-key"] !== EL_KEY) return send(401, { detail: "invalid api key" });
  const url = new URL(req.url, "http://mock");
  if (req.method === "POST" && url.pathname === "/v1/convai/agents/create") {
    if (mockFailCreate) return send(401, { detail: { status: "missing_permissions", message: "The API key you used is missing the permission convai_write to execute this operation." } });
    const id = `agent_test_${mock.agents.size + 1}`;
    mock.agents.set(id, body);
    return send(200, { agent_id: id });
  }
  const agentMatch = url.pathname.match(/^\/v1\/convai\/agents\/([^/]+)$/);
  if (agentMatch) {
    if (!mock.agents.has(agentMatch[1])) return send(404, { detail: "not found" });
    if (req.method === "PATCH") {
      const prev = mock.agents.get(agentMatch[1]);
      const prevTools = prev?.conversation_config?.agent?.prompt?.tools;
      const next = JSON.parse(JSON.stringify(body));
      // Like ElevenLabs, a partial update keeps fields it doesn't mention (here: the prompt's tool list).
      if (prevTools && next.conversation_config?.agent?.prompt && !("tools" in next.conversation_config.agent.prompt)) {
        next.conversation_config.agent.prompt.tools = prevTools;
      }
      mock.agents.set(agentMatch[1], prev && !next.conversation_config?.agent?.first_message ? { ...prev, ...next, conversation_config: { ...prev.conversation_config, agent: { ...prev.conversation_config.agent, prompt: { ...prev.conversation_config.agent.prompt, ...next.conversation_config.agent.prompt } } } } : next);
    }
    if (req.method === "GET") return send(200, { agent_id: agentMatch[1], ...mock.agents.get(agentMatch[1]) });
    return send(200, { agent_id: agentMatch[1] });
  }
  if (req.method === "GET" && url.pathname === "/v1/convai/conversation/token") {
    const agent = url.searchParams.get("agent_id");
    if (!mock.agents.has(agent)) return send(404, { detail: "agent not found" });
    mock.tokens.push({ agent, participant: url.searchParams.get("participant_name") });
    return send(200, { token: `tok_${mock.tokens.length}`, conversation_id: `conv_${mock.tokens.length}` });
  }
  if (req.method === "GET" && url.pathname === "/v1/user/subscription") {
    return send(200, {
      tier: "creator", status: "active", character_count: 12500, character_limit: 100000,
      next_character_count_reset_unix: 1798761600, currency: "usd",
      current_overage: { amount: "0", currency: "usd" }, next_invoice: { amount_due_cents: 2200 },
    });
  }
  if (req.method === "GET" && url.pathname === "/v2/voices") {
    return send(200, {
      voices: [
        { voice_id: DEFAULT_VOICE, name: "Old Saint Nick", description: "Warm and deep", preview_url: null, category: "professional", labels: { age: "old", gender: "male" } },
        { voice_id: "VoiceOther456", name: "Young Narrator", description: "", preview_url: null, category: "premade", labels: {} },
      ],
      has_more: false,
    });
  }
  send(404, { detail: "unknown" });
});
await new Promise((r) => mockServer.listen(MOCK_PORT, r));

/* ------------------------------ Next server ------------------------------ */
try {
  await fetch(`${BASE}/robots.txt`);
  console.error(`Port ${PORT} is already in use. Stop it and rerun.`);
  process.exit(1);
} catch {}
const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  cwd: ROOT,
  env: {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: TEST_DB,
    ELEVENLABS_API_KEY: EL_KEY,
    ELEVENLABS_BASE_URL: `http://localhost:${MOCK_PORT}`,
    ELEVENLABS_VOICE_ID: DEFAULT_VOICE,
    OPENAI_API_KEY: "",
    SETUP_TOKEN: "el-setup",
  },
  stdio: "ignore",
  detached: true,
});
const stopServer = () => {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {}
};
process.on("exit", stopServer);
for (let i = 0; i < 60; i++) {
  try {
    await fetch(`${BASE}/robots.txt`);
    break;
  } catch {
    await sleep(500);
  }
}

function client() {
  const jar = new Map();
  return async (path, { method = "GET", body } = {}) => {
    const headers = { origin: BASE, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") };
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const [k, ...v] = pair.split("=");
      jar.set(k, v.join("="));
    }
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text };
  };
}

const owner = client();
const other = client();
const kid = client();
let childId;

console.log("\nNorth Pole Direct Line · ElevenLabs engine\n");

await check("setup: owner, a child with a wish list, a second parent, a paired device", async () => {
  await owner("/api/parent/auth/setup", { method: "POST", body: { setupToken: "el-setup", familyName: "EL", name: "Pat", email: "pat@el.test", password: "a-long-password", timezone: "America/New_York" } });
  const c = await owner("/api/parent/children", { method: "POST", body: { firstName: "Alice", nickname: "Ace", age: 13, pets: "A beagle named Pepper", topicsToAvoid: "the move" } });
  childId = c.json.child.id;
  await owner(`/api/parent/children/${childId}/wishes`, { method: "POST", body: { title: "Bauer Vapor skates", details: "size 8", link: "https://example.com/skates", notes: "PRIVATE-NOTE", topWish: true } });
  await owner("/api/parent/access-code", { method: "POST", body: { code: "elf-crew-1" } });
  await owner("/api/parent/me", { method: "PATCH", body: { consent: true } });
  await owner("/api/parent/parents", { method: "POST", body: { name: "Jo", email: "jo@el.test", password: "temporary-pass-1" } });
  await other("/api/parent/auth/login", { method: "POST", body: { email: "jo@el.test", password: "temporary-pass-1" } });
  const pair = await kid("/api/family/access", { method: "POST", body: { code: "elf-crew-1" } });
  assert(pair.status === 200 && childId, `pair ${pair.status}`);
});

await check("before connecting, status explains the next step", async () => {
  const status = await owner("/api/parent/voice-status");
  assert(status.json.provider === "elevenlabs" && status.json.ok === false && /Connect ElevenLabs/.test(status.json.message), JSON.stringify(status.json));
});

await check("only the owner can connect ElevenLabs or browse voices", async () => {
  const a = await other("/api/parent/elevenlabs/connect", { method: "POST" });
  const b = await other("/api/parent/elevenlabs/voices");
  assert(a.status === 403 && b.status === 403, `${a.status} ${b.status}`);
});

await check("if agent setup fails, the first call fails honestly (no fake connection)", async () => {
  mockFailCreate = true;
  const r = await kid("/api/call/start", { method: "POST", body: { childId } });
  mockFailCreate = false;
  assert(r.status === 503 && r.json.error.code === "voice_not_configured", `start ${r.status} ${r.text}`);
});

await check("Connect ElevenLabs creates a private agent with per-call overrides enabled", async () => {
  const r = await owner("/api/parent/elevenlabs/connect", { method: "POST" });
  assert(r.status === 200 && r.json.agentId === "agent_test_1", `connect ${r.status} ${r.text}`);
  const cfg = mock.agents.get("agent_test_1");
  assert(cfg.platform_settings.auth.enable_auth === true, "auth must be required");
  const o = cfg.platform_settings.overrides.conversation_config_override;
  assert(o.agent.prompt.prompt && o.agent.first_message && o.tts.voice_id && o.agent.prompt.llm, "overrides not enabled");
  assert(cfg.conversation_config.tts.voice_id === DEFAULT_VOICE, "default voice not applied");
  assert(cfg.conversation_config.conversation.client_events.includes("user_transcript"), "transcripts not enabled");
  assert(cfg.conversation_config.agent.prompt.built_in_tools.end_call === null, "Santa must not be able to hang up on his own");
  assert(cfg.conversation_config.turn.interruption_ignore_terms.includes("uh huh") && cfg.conversation_config.turn.merge_with_default_ignore_terms === true, "backchannel ignore terms missing");
  assert(cfg.conversation_config.agent.disable_first_message_interruptions === true, "first message should not be interruptible");
  const again = await owner("/api/parent/elevenlabs/connect", { method: "POST" });
  assert(again.json.agentId === "agent_test_1" && mock.agents.size === 1, "reconnect should update, not duplicate");
  const status = await owner("/api/parent/voice-status");
  assert(status.json.ok === true, JSON.stringify(status.json));
});

await check("voices list comes from the ElevenLabs account", async () => {
  const r = await owner("/api/parent/elevenlabs/voices");
  assert(r.status === 200 && r.json.voices[0].name === "Old Saint Nick" && /old/.test(r.json.voices[0].description), r.text);
});

let started;
await check("call start returns a one-time token and this child's briefing, with no secrets or parent-only data", async () => {
  const r = await kid("/api/call/start", { method: "POST", body: { childId } });
  assert(r.status === 200 && r.json.provider === "elevenlabs" && r.json.conversationToken === "tok_1", `start ${r.status} ${r.text}`);
  started = r.json;
  const prompt = r.json.overrides.agent.prompt.prompt;
  for (const must of ["Ace", "A beagle named Pepper", "Bauer Vapor skates (size 8)", "the move", "Write only the exact words Santa says out loud"]) assert(prompt.includes(must), `missing "${must}"`);
  assert(r.json.overrides.agent.firstMessage.includes("Ace"), "greeting should use the child's name");
  assert(r.json.overrides.tts.voiceId === DEFAULT_VOICE, "voice override");
  const blob = JSON.stringify(r.json);
  for (const mustNot of [EL_KEY, "example.com/skates", "PRIVATE-NOTE", "purchased", "# Your voice"]) assert(!blob.includes(mustNot), `leaked "${mustNot}"`);
  const row = (await db.query(`SELECT model, "openaiCallId" FROM "Call" WHERE id=$1`, [r.json.callId])).rows[0];
  assert(row.model.startsWith("elevenlabs:") && row.openaiCallId === "conv_1", JSON.stringify(row));
});

await check("call start paces a 3 to 5 minute call, with the elves only on a long call and no early cutoff", async () => {
  assert(started.pacing && started.pacing.wrapUpAt === 240 && started.pacing.elvesAt === 600 && started.maxSeconds === 780, JSON.stringify(started.pacing));
});

await check("connected, heartbeat and end work without trying to hang up via OpenAI", async () => {
  await kid(`/api/call/${started.callId}/connected`, { method: "POST" });
  const hb = await kid(`/api/call/${started.callId}/heartbeat`, { method: "POST" });
  assert(hb.json.stop === false, hb.text);
  const end = await kid(`/api/call/${started.callId}/end`, { method: "POST", body: { reason: "user_hangup", durationSec: 5 } });
  assert(end.status === 200, end.text);
});

await check("an existing agent gets updated settings automatically before the next call", async () => {
  await db.query(`UPDATE "Family" SET "elevenAgentVersion" = 0`);
  const patchesBefore = mock.requests.filter((r) => r.method === "PATCH").length;
  const r = await kid("/api/call/start", { method: "POST", body: { childId } });
  assert(r.status === 200, `start ${r.status} ${r.text}`);
  const patches = mock.requests.filter((x) => x.method === "PATCH");
  assert(patches.length === patchesBefore + 1 && patches.at(-1).url.endsWith("/agent_test_1"), "agent was not refreshed");
  const v = (await db.query(`SELECT "elevenAgentVersion" v FROM "Family"`)).rows[0].v;
  assert(v >= 2, `version not recorded (${v})`);
  await kid(`/api/call/${r.json.callId}/end`, { method: "POST", body: { reason: "cancelled" } });
  const again = await kid("/api/call/start", { method: "POST", body: { childId } });
  assert(mock.requests.filter((x) => x.method === "PATCH").length === patches.length, "should not refresh again once up to date");
  await kid(`/api/call/${again.json.callId}/end`, { method: "POST", body: { reason: "cancelled" } });
});

await check("a hang-up tool left over in the agent's tool list is removed automatically", async () => {
  const cfg = mock.agents.get("agent_test_1");
  cfg.conversation_config.agent.prompt.tools = [{ type: "system", name: "end_call", params: { system_tool_type: "end_call" } }];
  await db.query(`UPDATE "Family" SET "elevenAgentVersion" = 0`);
  const r = await kid("/api/call/start", { method: "POST", body: { childId } });
  assert(r.status === 200, `start ${r.status} ${r.text}`);
  const after = mock.agents.get("agent_test_1").conversation_config.agent.prompt;
  assert(Array.isArray(after.tools) && after.tools.length === 0, `tools still ${JSON.stringify(after.tools)}`);
  assert(after.built_in_tools?.end_call == null, "built-in hang-up still set");
  await kid(`/api/call/${r.json.callId}/end`, { method: "POST", body: { reason: "cancelled" } });
});

await check("the parent's voice and model choices are used on the next call", async () => {
  await owner("/api/parent/personality", { method: "PATCH", body: { elevenVoiceId: "VoiceOther456", elevenLlm: "claude-sonnet-4-5" } });
  const r = await kid("/api/call/start", { method: "POST", body: { childId } });
  assert(r.json.overrides.tts.voiceId === "VoiceOther456" && r.json.overrides.agent.prompt.llm === "claude-sonnet-4-5", JSON.stringify(r.json.overrides.tts));
  await kid(`/api/call/${r.json.callId}/end`, { method: "POST", body: { reason: "cancelled" } });
  const bad = await owner("/api/parent/personality", { method: "PATCH", body: { elevenLlm: "made-up-model" } });
  assert(bad.status === 400, `bad model ${bad.status}`);
});

await check("Santa asks \"have you been good\" on the first real call only", async () => {
  assert(started.overrides.agent.prompt.prompt.includes("have you been good this year?"), "first call should ask");
  await db.query(`UPDATE "Call" SET "durationSec" = 150 WHERE id = $1`, [started.callId]);
  const r = await kid("/api/call/start", { method: "POST", body: { childId } });
  assert(r.status === 200, `start ${r.status}`);
  const prompt = r.json.overrides.agent.prompt.prompt;
  assert(!prompt.includes("have you been good this year?") && prompt.includes("Don't ask whether they've been good; you already did"), "repeat call should not ask again");
  await kid(`/api/call/${r.json.callId}/end`, { method: "POST", body: { reason: "cancelled" } });
});

await check("household notes reach Santa on that household's kids' calls, never another household's", async () => {
  const a = await owner("/api/parent/me", { method: "PATCH", body: { householdNotes: "Our scout elf is named Scout. He hides in the tree." } });
  assert(a.status === 200 && a.json.me.householdNotes.includes("Scout"), `save ${a.status} ${a.text}`);
  await other("/api/parent/me", { method: "PATCH", body: { householdNotes: "OTHER-HOUSEHOLD elf is Twinkle." } });
  const r = await kid("/api/call/start", { method: "POST", body: { childId } });
  assert(r.status === 200, `start ${r.status}`);
  const prompt = r.json.overrides.agent.prompt.prompt;
  assert(prompt.includes("Our scout elf is named Scout") && prompt.includes("# Scout elves"), "household notes missing");
  assert(!prompt.includes("OTHER-HOUSEHOLD"), "another household's notes leaked");
  await kid(`/api/call/${r.json.callId}/end`, { method: "POST", body: { reason: "cancelled" } });
});

await check("owner sees live plan usage and call minutes; other parents can't", async () => {
  const r = await owner("/api/parent/usage");
  const sub = r.json.subscription;
  assert(r.status === 200 && sub.ok && sub.creditsUsed === 12500 && sub.creditsLimit === 100000 && sub.nextInvoice === "$22.00", r.text);
  const blocked = await other("/api/parent/usage");
  assert(blocked.status === 403, `other parent ${blocked.status}`);
  const page = await owner("/parent");
  assert(page.text.includes("Usage &amp; spending") || page.text.includes("Usage & spending"), "usage card missing from owner overview");
  assert(/of calls in (?:<!-- -->)?[A-Z][a-z]+/.test(page.text), "monthly minutes missing");
});

await check("in the browser, a failed ElevenLabs connection shows an honest error", async () => {
  const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const ctx = await browser.newContext({ permissions: ["microphone"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + "/");
  await page.getByPlaceholder("North Pole code").fill("elf-crew-1");
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByRole("button", { name: "Call Santa" }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Call Santa" }).click();
  // The mock token can't open a real ElevenLabs session, so this must fail visibly, never fake "Connected".
  await page.getByText(/couldn't connect to the North Pole|taking too long to answer/i).waitFor({ timeout: 40000 });
  assert(!(await page.getByText("Connected to North Pole Workshop").isVisible()), "showed connected");
  await browser.close();
  assert(errors.length === 0, errors.join(" | "));
});

stopServer();
mockServer.close();
await db.end();
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
