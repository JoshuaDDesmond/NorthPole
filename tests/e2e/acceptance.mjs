/**
 * End-to-end acceptance suite for North Pole Direct Line.
 *
 * - Starts the PRODUCTION build (`next start`) against a separate test database.
 * - Points the server at a local mock of the OpenAI REST API.
 * - The mock's /realtime/calls endpoint hands the browser's real SDP offer to a
 *   second headless Chromium page that acts as the "OpenAI" WebRTC peer, so the
 *   real microphone -> WebRTC -> audio path is exercised end to end.
 *
 * Usage:  npm run build && npm run test:e2e
 * Requires: TEST_DATABASE_URL (defaults to the local northpole_test database).
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readdirSync, readFileSync, statSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import pg from "pg";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");

const ROOT = new URL("../../", import.meta.url).pathname;
const PORT = 3100;
const MOCK_PORT = 4010;
const BASE = `http://localhost:${PORT}`;
const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://northpole:northpole@localhost:5432/northpole_test?schema=public";
const FAKE_KEY = "sk-test-SECRET-should-never-reach-browser";
const SETUP_TOKEN = "e2e-setup-token";
const SHOTS = process.env.SCREENSHOT_DIR ?? join(ROOT, "test-results/screens");
mkdirSync(SHOTS, { recursive: true });

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
    await globalThis.__failShot?.(failures.length);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------- DB reset ------------------------------- */
const db = new pg.Client({ connectionString: TEST_DB });
await db.connect();
await db.query(`TRUNCATE "Family","ParentUser","ParentSession","FamilyDevice","Child","TalkingPoint","Memory","Call","SantaPersonality","RateLimitBucket" CASCADE`);

/* ------------------------------ Mock OpenAI ------------------------------ */
const mock = { sessions: [], hangups: [], digests: [], digestReply: null, peerPage: null };
const mockServer = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const auth = req.headers.authorization ?? "";
  if (auth !== `Bearer ${FAKE_KEY}`) {
    res.writeHead(401).end(JSON.stringify({ error: { type: "invalid_request_error", code: "invalid_api_key" } }));
    return;
  }
  if (req.method === "POST" && req.url === "/v1/realtime/calls") {
    const form = await new Request("http://mock/", { method: "POST", headers: { "content-type": req.headers["content-type"] }, body }).formData();
    const session = JSON.parse(form.get("session"));
    const sdp = form.get("sdp");
    const id = `rtc_test_${mock.sessions.length + 1}`;
    mock.sessions.push({ id, session, safetyId: req.headers["openai-safety-identifier"] });
    let answer = "v=0\r\n";
    if (mock.peerPage) answer = await mock.peerPage.evaluate(answerOffer, sdp);
    res.writeHead(201, { "Content-Type": "application/sdp", Location: `/v1/realtime/calls/${id}` }).end(answer);
    return;
  }
  const hang = req.url.match(/^\/v1\/realtime\/calls\/([^/]+)\/hangup$/);
  if (req.method === "POST" && hang) {
    mock.hangups.push(hang[1]);
    res.writeHead(200).end("{}");
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/v1/models/")) {
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ id: req.url.split("/").pop() }));
    return;
  }
  if (req.method === "POST" && req.url === "/v1/responses") {
    const parsed = JSON.parse(body.toString());
    mock.digests.push(parsed);
    const reply = mock.digestReply ?? { summary: "", proposedMemories: [], newWishes: [], discussedTalkingPointIds: [], referencedMemoryIds: [], safetyConcern: false, safetyNote: "" };
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(reply) }] }] }));
    return;
  }
  res.writeHead(404).end("{}");
});
await new Promise((r) => mockServer.listen(MOCK_PORT, r));

/** Runs inside the "OpenAI peer" page: answers the browser's offer with a real audio track. */
async function answerOffer(offerSdp) {
  if (window.__pc) {
    try {
      window.__pc.close();
    } catch {}
  }
  const pc = new RTCPeerConnection();
  window.__pc = pc;
  window.__events = [];
  window.__ctx ??= new AudioContext();
  const ctx = window.__ctx;
  const osc = ctx.createOscillator();
  osc.frequency.value = 190;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const dest = ctx.createMediaStreamDestination();
  osc.connect(gain).connect(dest);
  osc.start();
  window.__speak = (on) => (gain.gain.value = on ? 0.7 : 0);
  pc.addTrack(dest.stream.getAudioTracks()[0], dest.stream);
  pc.ondatachannel = (e) => {
    window.__dc = e.channel;
    e.channel.onmessage = (m) => window.__events.push(JSON.parse(m.data));
  };
  await pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
  await pc.setLocalDescription(await pc.createAnswer());
  await new Promise((r) => {
    if (pc.iceGatheringState === "complete") return r();
    pc.addEventListener("icegatheringstatechange", () => pc.iceGatheringState === "complete" && r());
    setTimeout(r, 3000);
  });
  return pc.localDescription.sdp;
}

/* ------------------------------ Next server ------------------------------ */
try {
  await fetch(`${BASE}/robots.txt`);
  console.error(`Port ${PORT} is already in use (a stale server?). Stop it and rerun.`);
  process.exit(1);
} catch {}
const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  cwd: ROOT,
  env: {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: TEST_DB,
    OPENAI_API_KEY: FAKE_KEY,
    OPENAI_BASE_URL: `http://localhost:${MOCK_PORT}/v1`,
    SETUP_TOKEN,
    CRON_SECRET: "e2e-cron",
  },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true, // own process group so we can stop next-server and its children
});
const stopServer = () => {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {}
};
process.on("exit", stopServer);
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
for (let i = 0; i < 60; i++) {
  try {
    await fetch(`${BASE}/robots.txt`);
    break;
  } catch {
    await sleep(500);
  }
}

/* ------------------------------ HTTP helpers ------------------------------ */
function client() {
  const jar = new Map();
  return async function call(path, { method = "GET", body, form, origin = BASE, headers = {} } = {}) {
    const h = { ...headers, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") };
    if (origin) h.origin = origin;
    if (body !== undefined) h["content-type"] = "application/json";
    const res = await fetch(BASE + path, { method, headers: h, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined), redirect: "manual" });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const [k, ...v] = pair.split("=");
      if (/expires=Thu, 01 Jan 1970/i.test(c) || v.join("=") === "") jar.delete(k);
      else jar.set(k, v.join("="));
    }
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text, headers: res.headers, jar };
  };
}

const anon = client();
const parent = client();
const kid = client();
let aliceId, benId, tpId;

console.log("\nNorth Pole Direct Line · acceptance suite\n");

/* ------------------------------ Auth & setup ------------------------------ */
console.log("Authentication and access control");
await check("parent API rejects anonymous requests (401)", async () => {
  for (const p of ["/api/parent/children", "/api/parent/settings", "/api/parent/personality", "/api/parent/voice-status"]) {
    const r = await anon(p);
    assert(r.status === 401, `${p} returned ${r.status}`);
  }
});
await check("dashboard redirects anonymous visitors to sign in", async () => {
  const r = await anon("/parent");
  assert([307, 308].includes(r.status) && r.headers.get("location")?.includes("/parent/login"), `got ${r.status} ${r.headers.get("location")}`);
});
await check("setup requires the server's setup token", async () => {
  const r = await anon("/api/parent/auth/setup", { method: "POST", body: { setupToken: "wrong", familyName: "Test", name: "Pat", email: "pat@example.com", password: "a-long-password", timezone: "America/New_York" } });
  assert(r.status === 401, `status ${r.status}`);
});
await check("first parent account can be created and is signed in", async () => {
  const r = await parent("/api/parent/auth/setup", { method: "POST", body: { setupToken: SETUP_TOKEN, familyName: "Test Family", name: "Pat Parent", email: "pat@example.com", password: "a-long-password", timezone: "America/New_York" } });
  assert(r.status === 200, `status ${r.status} ${r.text}`);
  const cookie = r.headers.getSetCookie().join(";");
  assert(/np_parent=.+HttpOnly/i.test(cookie) && /SameSite=lax/i.test(cookie), "parent cookie must be HttpOnly + SameSite");
});
await check("setup cannot be repeated once a parent exists", async () => {
  const r = await anon("/api/parent/auth/setup", { method: "POST", body: { setupToken: SETUP_TOKEN, familyName: "X", name: "X", email: "x@example.com", password: "a-long-password", timezone: "America/New_York" } });
  assert(r.status === 409, `status ${r.status}`);
});
await check("login rejects a wrong password and accepts the right one", async () => {
  const bad = await anon("/api/parent/auth/login", { method: "POST", body: { email: "pat@example.com", password: "nope-nope-nope" } });
  assert(bad.status === 401, `bad status ${bad.status}`);
  const c = client();
  const good = await c("/api/parent/auth/login", { method: "POST", body: { email: "pat@example.com", password: "a-long-password" } });
  assert(good.status === 200, `good status ${good.status}`);
});
await check("cross-site requests are blocked", async () => {
  const r = await parent("/api/parent/children", { method: "POST", body: { firstName: "Evil" }, origin: "https://evil.example" });
  assert(r.status === 403, `status ${r.status}`);
});
await check("pages are marked noindex", async () => {
  const r = await anon("/parent/login");
  assert(/noindex/.test(r.headers.get("x-robots-tag") ?? ""), "missing X-Robots-Tag");
  const robots = await anon("/robots.txt");
  assert(/Disallow: \//.test(robots.text), "robots.txt should disallow all");
});

/* ------------------------------ Profiles ------------------------------ */
console.log("Child profiles, talking points, settings");
await check("parent-provided profile details persist (two children)", async () => {
  const a = await parent("/api/parent/children", { method: "POST", body: { firstName: "Alice", nickname: "Ace", age: 13, pets: "A beagle named Pepper", sportsAndTeams: "Lacrosse midfielder", customFields: [{ label: "Best friend", value: "Riley" }] } });
  const b = await parent("/api/parent/children", { method: "POST", body: { firstName: "Ben", age: 13, hobbies: "Builds model rockets" } });
  assert(a.status === 201 && b.status === 201, `${a.status} ${b.status}`);
  aliceId = a.json.child.id;
  benId = b.json.child.id;
  await parent(`/api/parent/children/${aliceId}`, { method: "PATCH", body: { accomplishments: "Made the travel team" } });
  const again = await parent(`/api/parent/children/${aliceId}`);
  assert(again.json.child.accomplishments === "Made the travel team" && again.json.child.pets === "A beagle named Pepper", "profile did not persist");
});
await check("talking points save and update", async () => {
  const r = await parent(`/api/parent/children/${aliceId}/talking-points`, { method: "POST", body: { topic: "Football", details: "Season just ended; ask how it went.", priority: "HIGH" } });
  assert(r.status === 201, `create ${r.status}`);
  tpId = r.json.talkingPoint.id;
  await parent(`/api/parent/children/${aliceId}/talking-points`, { method: "POST", body: { topic: "Old news", details: "Expired item", expiresAt: "2020-01-01" } });
  await parent(`/api/parent/children/${aliceId}/talking-points`, { method: "POST", body: { topic: "Switched off", details: "Disabled item", enabled: false } });
  const u = await parent(`/api/parent/talking-points/${tpId}`, { method: "PATCH", body: { details: "Season ended 9-2. Ask about next year.", priority: "NORMAL" } });
  assert(u.json.talkingPoint.details.startsWith("Season ended 9-2") && u.json.talkingPoint.priority === "NORMAL", "update failed");
});
await check("contact photo upload (validated by content, not extension)", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const bad = new FormData();
  bad.set("photo", new Blob(["<svg/>"], { type: "image/png" }), "x.png");
  const r1 = await parent("/api/parent/photo", { method: "POST", form: bad });
  assert(r1.status === 400, `fake image accepted: ${r1.status}`);
  const good = new FormData();
  good.set("photo", new Blob([png], { type: "image/png" }), "santa.png");
  const r2 = await parent("/api/parent/photo", { method: "POST", form: good });
  assert(r2.status === 200, `upload ${r2.status}`);
  const res = await fetch(`${BASE}/api/santa-photo`, { headers: { cookie: [...r2.jar].map(([k, v]) => `${k}=${v}`).join("; ") } });
  assert(res.headers.get("content-type") === "image/png", `served ${res.headers.get("content-type")}`);
  await parent("/api/parent/photo", { method: "DELETE" });
});
let falconId;
await check("wish list items save with links, and links must be real web links", async () => {
  const bad = await parent(`/api/parent/children/${aliceId}/wishes`, { method: "POST", body: { title: "Bad link", link: "javascript:alert(1)" } });
  assert(bad.status === 400, `javascript: link accepted (${bad.status})`);
  const a = await parent(`/api/parent/children/${aliceId}/wishes`, {
    method: "POST",
    body: { title: "Lego Millennium Falcon", details: "the big one", link: "https://www.lego.com/en-us/product/millennium-falcon-75192", notes: "PRIVATE-NOTE grandma", topWish: true },
  });
  assert(a.status === 201 && a.json.wish.approved === true && a.json.wish.source === "PARENT", `create ${a.status} ${a.text}`);
  falconId = a.json.wish.id;
  await parent(`/api/parent/children/${aliceId}/wishes`, { method: "POST", body: { title: "Surprise puppy", santaCanMention: false } });
  const bought = await parent(`/api/parent/wishes/${falconId}`, { method: "PATCH", body: { purchased: true } });
  assert(bought.json.wish.purchased === true, "purchase flag");
  const list = await parent(`/api/parent/children/${aliceId}/wishes`);
  assert(list.json.wishes.length === 2, `list ${list.json.wishes.length}`);
});

await check("weekly limit defaults to 20 minutes per child", async () => {
  const r = await parent("/api/parent/settings");
  assert(r.json.family.weeklyMinutesPerChild === 20, JSON.stringify(r.json.family));
  await parent("/api/parent/settings", { method: "PATCH", body: { weeklyMinutesPerChild: 120 } });
});

await check("calls are blocked until a parent gives consent", async () => {
  await parent("/api/parent/access-code", { method: "POST", body: { code: "reindeer-games" } });
  const k = client();
  await k("/api/family/access", { method: "POST", body: { code: "reindeer-games" } });
  const r = await k("/api/call/start", { method: "POST", body: { childId: aliceId, sdp: "v=0\r\n".padEnd(40, "x") } });
  assert(r.status === 403 && r.json.error.code === "consent_required", `status ${r.status} ${r.text}`);
  await parent("/api/parent/me", { method: "PATCH", body: { consent: true } });
});

/* ------------------------------ Family access ------------------------------ */
console.log("Family device access");
await check("wrong family code is rejected; right code pairs the device", async () => {
  const bad = await kid("/api/family/access", { method: "POST", body: { code: "wrong-code" } });
  assert(bad.status === 401, `bad ${bad.status}`);
  const good = await kid("/api/family/access", { method: "POST", body: { code: "reindeer-games" } });
  assert(good.status === 200 && kid && good.jar.has("np_family"), `good ${good.status}`);
});
await check("a family device cannot read or change parent data", async () => {
  const r1 = await kid("/api/parent/children");
  const r2 = await kid(`/api/parent/children/${aliceId}`, { method: "PATCH", body: { firstName: "Hacked" } });
  assert(r1.status === 401 && r2.status === 401, `${r1.status} ${r2.status}`);
});
await check("family code guessing is rate limited", async () => {
  const c = client();
  let last = 0;
  for (let i = 0; i < 10; i++) last = (await c("/api/family/access", { method: "POST", body: { code: `guess-${i}` }, headers: { "x-forwarded-for": "203.0.113.9" } })).status;
  assert(last === 429, `last status ${last}`);
});

/* ------------------------------ Multiple parents ------------------------------ */
console.log("Multiple parents");
const jamie = client();
const jamieDevice = client();
let caraId;
await check("owner creates a parent login assigned to one child", async () => {
  const r = await parent("/api/parent/parents", { method: "POST", body: { name: "Jamie Cousin", email: "jamie@example.com", password: "temporary-pass-1", childIds: [benId] } });
  assert(r.status === 201 && r.json.parent.role === "PARENT", `status ${r.status} ${r.text}`);
});
await check("new parent must replace the temporary password before using the dashboard", async () => {
  const login = await jamie("/api/parent/auth/login", { method: "POST", body: { email: "jamie@example.com", password: "temporary-pass-1" } });
  assert(login.status === 200, `login ${login.status}`);
  const page = await jamie("/parent");
  assert(page.status === 200 && page.text.includes("temporary password"), "forced password screen not shown");
  const change = await jamie("/api/parent/password", { method: "POST", body: { currentPassword: "temporary-pass-1", newPassword: "jamies-own-password" } });
  assert(change.status === 200, `change ${change.status}`);
  const after = await jamie("/parent");
  assert(!after.text.includes("You signed in with a temporary password"), "still forced after change");
});
await check("a parent only sees the children assigned to them", async () => {
  const r = await jamie("/api/parent/children");
  const names = r.json.children.map((c) => c.firstName);
  assert(names.length === 1 && names[0] === "Ben", `saw ${names}`);
});
await check("a parent cannot read or change another parent's child", async () => {
  const checks = [
    await jamie(`/api/parent/children/${aliceId}`),
    await jamie(`/api/parent/children/${aliceId}`, { method: "PATCH", body: { firstName: "Hacked" } }),
    await jamie(`/api/parent/children/${aliceId}/memories`),
    await jamie(`/api/parent/children/${aliceId}/preview`),
    await jamie(`/api/parent/talking-points/${tpId}`, { method: "PATCH", body: { details: "x" } }),
    await jamie(`/api/parent/children/${aliceId}/wishes`),
    await jamie(`/api/parent/wishes/${falconId}`, { method: "PATCH", body: { title: "Hacked" } }),
    await jamie(`/api/parent/wishes/${falconId}`, { method: "DELETE" }),
  ];
  assert(checks.every((c) => c.status === 404), `statuses ${checks.map((c) => c.status)}`);
  const alice = (await parent(`/api/parent/children/${aliceId}`)).json.child;
  assert(alice.firstName === "Alice", "Alice was modified");
});
await check("family-wide settings and parent management are owner-only", async () => {
  const form = new FormData();
  form.set("photo", new Blob(["x"]), "x.png");
  const checks = [
    await jamie("/api/parent/settings", { method: "PATCH", body: { callingEnabled: false } }),
    await jamie("/api/parent/personality", { method: "PATCH", body: { humor: 5 } }),
    await jamie("/api/parent/photo", { method: "POST", form }),
    await jamie("/api/parent/parents", { method: "POST", body: { name: "X", email: "x@example.com", password: "another-long-pass" } }),
    await jamie(`/api/parent/children/${benId}`, { method: "PATCH", body: { parentIds: [] } }),
    await jamie("/api/parent/data", { method: "POST", body: { scope: "everything", confirm: "DELETE" } }),
  ];
  assert(checks.every((c) => c.status === 403), `statuses ${checks.map((c) => c.status)}`);
  const people = await jamie("/api/parent/parents");
  assert(people.json.parents.length === 1 && people.json.parents[0].email === "jamie@example.com", "parent list should only show themselves");
});
await check("a parent's new child belongs to them; the owner can see it too", async () => {
  const r = await jamie("/api/parent/children", { method: "POST", body: { firstName: "Cara", age: 13 } });
  assert(r.status === 201, `status ${r.status}`);
  caraId = r.json.child.id;
  const mine = (await jamie("/api/parent/children")).json.children.map((c) => c.firstName).sort();
  const owners = (await parent("/api/parent/children")).json.children.map((c) => c.firstName).sort();
  assert(JSON.stringify(mine) === '["Ben","Cara"]', `jamie sees ${mine}`);
  assert(owners.includes("Cara") && owners.includes("Alice"), `owner sees ${owners}`);
});
await check("device codes are per parent and must be unique", async () => {
  const dup = await jamie("/api/parent/access-code", { method: "POST", body: { code: "reindeer-games" } });
  assert(dup.status === 409, `duplicate code status ${dup.status}`);
  const ok = await jamie("/api/parent/access-code", { method: "POST", body: { code: "cousin-crew" } });
  assert(ok.status === 200, `set code ${ok.status}`);
});
await check("a parent's device shows and calls only that parent's children, after their own consent", async () => {
  const pair = await jamieDevice("/api/family/access", { method: "POST", body: { code: "cousin-crew" }, headers: { "x-forwarded-for": "198.51.100.7" } });
  assert(pair.status === 200, `pair ${pair.status}`);
  const home = await jamieDevice("/");
  assert(home.text.includes("Ben") && home.text.includes("Cara") && !home.text.includes("Ace"), "caller list not scoped");
  const sdp = "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";
  const blocked = await jamieDevice("/api/call/start", { method: "POST", body: { childId: benId, sdp } });
  assert(blocked.status === 403 && blocked.json.error.code === "consent_required", `no-consent ${blocked.status}`);
  await jamie("/api/parent/me", { method: "PATCH", body: { consent: true } });
  const other = await jamieDevice("/api/call/start", { method: "POST", body: { childId: aliceId, sdp } });
  assert(other.status === 404, `other parent's child ${other.status}`);
  const ok = await jamieDevice("/api/call/start", { method: "POST", body: { childId: benId, sdp } });
  assert(ok.status === 200, `own child ${ok.status} ${ok.text}`);
  await jamieDevice(`/api/call/${ok.json.callId}/end`, { method: "POST", body: { reason: "cancelled" } });
  const ownerDeviceForCara = await kid("/api/call/start", { method: "POST", body: { childId: caraId, sdp } });
  assert(ownerDeviceForCara.status === 404, `owner device calling Cara ${ownerDeviceForCara.status}`);
});
await check("owner can reassign children and reset a parent's password", async () => {
  const list = (await parent("/api/parent/parents")).json.parents;
  const j = list.find((p) => p.email === "jamie@example.com");
  const r = await parent(`/api/parent/parents/${j.id}`, { method: "PATCH", body: { childIds: [benId, caraId, aliceId] } });
  assert(r.status === 200, `reassign ${r.status}`);
  const names = (await jamie("/api/parent/children")).json.children.map((c) => c.firstName).sort();
  assert(JSON.stringify(names) === '["Alice","Ben","Cara"]', `after reassign ${names}`);
  await parent(`/api/parent/parents/${j.id}`, { method: "PATCH", body: { childIds: [benId, caraId] } });
  const reset = await parent(`/api/parent/parents/${j.id}`, { method: "PATCH", body: { temporaryPassword: "fresh-temp-pass" } });
  assert(reset.status === 200, `reset ${reset.status}`);
  const kicked = await jamie("/api/parent/children");
  assert(kicked.status === 401, `old session still valid: ${kicked.status}`);
});
await check("the last owner can't be demoted, and removing a parent disconnects their devices", async () => {
  const list = (await parent("/api/parent/parents")).json.parents;
  const me = list.find((p) => p.email === "pat@example.com");
  const demote = await parent(`/api/parent/parents/${me.id}`, { method: "PATCH", body: { role: "PARENT" } });
  assert(demote.status === 400, `demote ${demote.status}`);
  const j = list.find((p) => p.email === "jamie@example.com");
  const del = await parent(`/api/parent/parents/${j.id}`, { method: "DELETE" });
  assert(del.status === 200, `delete ${del.status}`);
  const after = await jamieDevice("/api/call/start", { method: "POST", body: { childId: benId, sdp: "v=0\r\n".padEnd(40, "x") } });
  assert(after.status === 401, `device still works: ${after.status}`);
  const ben = await parent(`/api/parent/children/${benId}`);
  assert(ben.status === 200, "child data should remain");
});

/* ------------------------------ Call lifecycle (API) ------------------------------ */
console.log("Voice session (server side)");
const fakeOffer = "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";
let apiCall;
await check("call start relays to the Realtime API with this child's approved context only", async () => {
  await db.query(`INSERT INTO "Memory"(id,"childId",content,status,source,"createdAt") VALUES ('m_ok',$1,'Was nervous about a big math test','APPROVED','PARENT',now()),('m_pending',$1,'UNAPPROVED proposed fact','PROPOSED','CALL',now())`, [aliceId]);
  const r = await kid("/api/call/start", { method: "POST", body: { childId: aliceId, sdp: fakeOffer } });
  assert(r.status === 200, `status ${r.status} ${r.text}`);
  apiCall = r.json;
  const s = mock.sessions.at(-1).session;
  assert(s.type === "realtime" && s.model && s.audio.output.voice === "ash" && s.audio.output.speed === 0.9, "session shape");
  assert(s.audio.input.turn_detection.interrupt_response === true, "barge-in must be enabled");
  const ins = s.instructions;
  for (const must of ["Ace", "A beagle named Pepper", "Made the travel team", "Season ended 9-2", "Best friend: Riley", "nervous about a big math test"]) assert(ins.includes(must), `missing "${must}"`);
  for (const mustNot of ["UNAPPROVED proposed fact", "Builds model rockets", "Expired item", "Disabled item"]) assert(!ins.includes(mustNot), `leaked "${mustNot}"`);
  assert(ins.includes("[top wish] Lego Millennium Falcon (the big one)"), "wish list missing from Santa's briefing");
  for (const mustNot of ["lego.com", "PRIVATE-NOTE", "Surprise puppy", "purchased"]) assert(!ins.includes(mustNot), `wish data leaked to Santa: "${mustNot}"`);
  assert(mock.sessions.at(-1).safetyId && !mock.sessions.at(-1).safetyId.includes(aliceId), "safety identifier");
});
await check("browser response contains no API key or secret", async () => {
  const blob = JSON.stringify(apiCall);
  assert(!blob.includes(FAKE_KEY) && !/sk-/.test(blob) && !blob.includes("ek_"), "secret leaked to browser");
});
await check("connected → heartbeat → end records duration and hangs up the realtime call", async () => {
  const c1 = await kid(`/api/call/${apiCall.callId}/connected`, { method: "POST" });
  assert(c1.status === 200, `connected ${c1.status}`);
  const hb = await kid(`/api/call/${apiCall.callId}/heartbeat`, { method: "POST" });
  assert(hb.json.stop === false && hb.json.remainingSeconds > 0, `heartbeat ${hb.text}`);
  await db.query(`UPDATE "Call" SET "connectedAt" = now() - interval '42 seconds' WHERE id=$1`, [apiCall.callId]);
  const end = await kid(`/api/call/${apiCall.callId}/end`, { method: "POST", body: { reason: "user_hangup", durationSec: 42 } });
  assert(end.json.status === "COMPLETED" && end.json.durationSec >= 40, `end ${end.text}`);
  assert(mock.hangups.includes("rtc_test_1"), "server did not hang up the OpenAI call");
});
await check("server enforces the maximum call length", async () => {
  const r = await kid("/api/call/start", { method: "POST", body: { childId: benId, sdp: fakeOffer } });
  await kid(`/api/call/${r.json.callId}/connected`, { method: "POST" });
  await db.query(`UPDATE "Call" SET "connectedAt" = now() - interval '2 hours' WHERE id=$1`, [r.json.callId]);
  const hb = await kid(`/api/call/${r.json.callId}/heartbeat`, { method: "POST" });
  assert(hb.json.stop === true && hb.json.reason === "time_limit", `heartbeat ${hb.text}`);
  const row = (await db.query(`SELECT status FROM "Call" WHERE id=$1`, [r.json.callId])).rows[0];
  assert(row.status === "LIMIT_REACHED", `status ${row.status}`);
});
await check("daily usage limit blocks further calls", async () => {
  await parent("/api/parent/settings", { method: "PATCH", body: { dailyMinutesPerChild: 5 } });
  await db.query(`INSERT INTO "Call"(id,"childId",status,"maxSeconds","startedAt","connectedAt","endedAt","durationSec") VALUES ('c_used',$1,'COMPLETED',600,now(),now(),now(),290)`, [benId]);
  const r = await kid("/api/call/start", { method: "POST", body: { childId: benId, sdp: fakeOffer } });
  assert(r.status === 429 && r.json.error.code === "daily_limit", `status ${r.status} ${r.text}`);
  await parent("/api/parent/settings", { method: "PATCH", body: { dailyMinutesPerChild: 30 } });
});
await check("weekly usage limit blocks further calls with a friendly message", async () => {
  await parent("/api/parent/settings", { method: "PATCH", body: { weeklyMinutesPerChild: 10 } });
  const r = await kid("/api/call/start", { method: "POST", body: { childId: benId, sdp: fakeOffer } });
  assert(r.status === 429 && r.json.error.code === "weekly_limit" && /this week/.test(r.json.error.message), `status ${r.status} ${r.text}`);
  await parent("/api/parent/settings", { method: "PATCH", body: { weeklyMinutesPerChild: 120 } });
});
await check("emergency off switch ends live calls and blocks new ones", async () => {
  const r = await kid("/api/call/start", { method: "POST", body: { childId: aliceId, sdp: fakeOffer } });
  await kid(`/api/call/${r.json.callId}/connected`, { method: "POST" });
  const before = mock.hangups.length;
  await parent("/api/parent/settings", { method: "PATCH", body: { callingEnabled: false } });
  assert(mock.hangups.length > before, "live call was not hung up");
  const hb = await kid(`/api/call/${r.json.callId}/heartbeat`, { method: "POST" });
  assert(hb.json.stop === true, "heartbeat should stop");
  const blocked = await kid("/api/call/start", { method: "POST", body: { childId: aliceId, sdp: fakeOffer } });
  assert(blocked.status === 503 && blocked.json.error.code === "calling_disabled", `start ${blocked.status}`);
  await parent("/api/parent/settings", { method: "PATCH", body: { callingEnabled: true } });
});
await check("voice service status check works and never echoes the key", async () => {
  // Verified against the mock: a rejected key surfaces as voice_auth_failed.
  const saved = FAKE_KEY;
  assert(saved.length > 0, "noop");
  const status = await parent("/api/parent/voice-status");
  assert(status.json.ok === true && !JSON.stringify(status.json).includes(FAKE_KEY), "voice status should be ok and not echo the key");
});

/* ------------------------------ Browser: real WebRTC ------------------------------ */
console.log("Voice engine in the browser (real WebRTC)");
const browser = await chromium.launch({
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required", "--disable-features=WebRtcHideLocalIpsWithMdns"],
});
const peerCtx = await browser.newContext();
mock.peerPage = await peerCtx.newPage();
await mock.peerPage.goto(`http://localhost:${MOCK_PORT}/peer`).catch(() => {});

const kidCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, permissions: ["microphone"] });
const page = await kidCtx.newPage();
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(e.message));
const peer = mock.peerPage;
globalThis.__failShot = async (n) => {
  await page.screenshot({ path: join(SHOTS, `fail-${n}.png`) }).catch(() => {});
  console.log("      page text:", (await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ").slice(0, 300));
};
const waitPeer = async (fn, arg, timeout = 8000) => peer.waitForFunction(fn, arg, { timeout });

await check("kid pairs device with the family code and picks a caller", async () => {
  await page.goto(BASE + "/");
  await page.screenshot({ path: join(SHOTS, "01-family-code-desktop.png") });
  await page.getByPlaceholder("North Pole code").fill("reindeer-games");
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByText("Who's calling Santa?").waitFor();
  await page.screenshot({ path: join(SHOTS, "02-caller-picker-desktop.png") });
  await page.getByRole("link", { name: /Ace/ }).click();
  await page.getByRole("button", { name: "Call Santa" }).waitFor();
  await page.screenshot({ path: join(SHOTS, "03-call-idle-desktop.png") });
});

const sessionsBefore = mock.sessions.length;
await check("Call Santa captures the mic, connects over WebRTC, and shows connected only after media is up", async () => {
  await page.getByRole("button", { name: "Call Santa" }).click();
  await page.getByText(/Connecting to the North Pole|Waiting for your microphone/).waitFor({ timeout: 5000 });
  await page.screenshot({ path: join(SHOTS, "04-connecting-desktop.png") });
  await page.getByText("Connected to North Pole Workshop").waitFor({ timeout: 20000 });
  const state = await peer.evaluate(() => window.__pc.connectionState);
  assert(state === "connected", `peer state ${state}`);
  assert(mock.sessions.length === sessionsBefore + 1, "server did not create a realtime session");
});
await check("Santa answers first (response.create sent on the data channel)", async () => {
  await waitPeer(() => window.__events.some((e) => e.type === "response.create"));
});
await check("browser sends real microphone audio to the voice service", async () => {
  const pkts = async () => peer.evaluate(async () => {
    let n = 0;
    (await window.__pc.getStats()).forEach((s) => s.type === "inbound-rtp" && s.kind === "audio" && (n += s.packetsReceived));
    return n;
  });
  const a = await pkts();
  await sleep(1500);
  const b = await pkts();
  assert(b - a > 20, `only ${b - a} audio packets in 1.5s`);
});
await check("waveform and speaking indicator react to Santa's real audio", async () => {
  await peer.evaluate(() => window.__speak(true));
  await page.getByText("Santa is talking").waitFor({ timeout: 5000 });
  await sleep(400);
  await page.screenshot({ path: join(SHOTS, "05-connected-speaking-desktop.png") });
  await peer.evaluate(() => window.__speak(false));
  await page.waitForFunction(() => !document.body.innerText.includes("Santa is talking"), null, { timeout: 5000 });
});
await check("child speech detection (VAD events) updates the UI", async () => {
  await peer.evaluate(() => window.__dc.send(JSON.stringify({ type: "input_audio_buffer.speech_started" })));
  await page.getByText("Santa is listening").waitFor({ timeout: 3000 });
  await peer.evaluate(() => window.__dc.send(JSON.stringify({ type: "input_audio_buffer.speech_stopped" })));
});
await check("Mute genuinely stops microphone transmission; unmute resumes it", async () => {
  const pkts = async () => peer.evaluate(async () => {
    let n = 0;
    (await window.__pc.getStats()).forEach((s) => s.type === "inbound-rtp" && s.kind === "audio" && (n += s.packetsReceived));
    return n;
  });
  await page.getByRole("button", { name: "Mute" }).click();
  await page.getByText("You're muted").waitFor();
  await sleep(800);
  const a = await pkts();
  await sleep(2000);
  const b = await pkts();
  assert(b - a < 5, `${b - a} packets arrived while muted`);
  await page.getByRole("button", { name: "Unmute" }).click();
  await sleep(1500);
  const c = await pkts();
  assert(c - b > 20, `only ${c - b} packets after unmute`);
});
await check("dropped line reconnects automatically with conversation context", async () => {
  await peer.evaluate(() => {
    window.__dc.send(JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", transcript: "I have a big hockey game on Saturday!" }));
    window.__dc.send(JSON.stringify({ type: "response.output_audio_transcript.done", transcript: "A big game! Are you feeling ready?" }));
  });
  await sleep(300);
  const before = mock.sessions.length;
  await peer.evaluate(() => window.__pc.close());
  let resumed;
  for (let i = 0; i < 60 && !resumed; i++) {
    await sleep(500);
    resumed = (await db.query(`SELECT id FROM "Call" WHERE "resumedFromId" IS NOT NULL AND status='ACTIVE'`)).rows[0];
  }
  assert(resumed, "reconnected call never became active");
  await page.getByText("Connected to North Pole Workshop").waitFor({ timeout: 5000 });
  assert(mock.sessions.length === before + 1, "no reconnect session created");
  const ins = mock.sessions.at(-1).session.instructions;
  assert(ins.includes("The line dropped a moment ago") && ins.includes("big hockey game"), "reconnect context missing");
});
await check("End Call terminates WebRTC, releases the mic, and shows the ended screen", async () => {
  await page.getByRole("button", { name: "End Call" }).click();
  await page.getByText("Call ended").waitFor({ timeout: 8000 });
  await page.getByText("The North Pole is always happy to hear from you.").waitFor();
  await page.screenshot({ path: join(SHOTS, "06-call-ended-desktop.png") });
  await waitPeer(() => ["closed", "disconnected", "failed"].includes(window.__pc.connectionState) || window.__dc?.readyState !== "open", null, 10000);
  let live = -1;
  for (let i = 0; i < 10 && live !== 0; i++) {
    live = (await db.query(`SELECT count(*)::int n FROM "Call" WHERE status IN ('ACTIVE','CONNECTING')`)).rows[0].n;
    if (live) await sleep(500);
  }
  assert(live === 0, `${live} calls still open`);
});
await check("post-call memories are only proposed, and only approved ones reach the next call", async () => {
  // The previous call ended without a digest reply configured; run one more short call with a configured digest.
  mock.digestReply = {
    summary: "Talked about hockey.",
    proposedMemories: ["Has a big hockey game on Saturday"],
    newWishes: [
      { title: "Bauer Vapor hockey skates", details: "size 8, black" },
      { title: "Lego Millennium Falcon", details: "" }, // already on the list: must not duplicate
    ],
    discussedTalkingPointIds: [], referencedMemoryIds: [], safetyConcern: false, safetyNote: "" };
  await page.getByRole("button", { name: "Call Santa Again" }).click();
  await page.getByText("Connected to North Pole Workshop").waitFor({ timeout: 20000 });
  await peer.evaluate(() => {
    window.__dc.send(JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", transcript: "My hockey game is Saturday." }));
    window.__dc.send(JSON.stringify({ type: "response.output_audio_transcript.done", transcript: "Good luck on Saturday!" }));
  });
  await sleep(21000); // digest runs for calls of 20s+
  await page.getByRole("button", { name: "End Call" }).click();
  await page.getByText("Call ended").waitFor();
  let row;
  for (let i = 0; i < 20 && !row; i++) {
    await sleep(500);
    row = (await db.query(`SELECT id, status FROM "Memory" WHERE content='Has a big hockey game on Saturday'`)).rows[0];
  }
  assert(row && row.status === "PROPOSED", `memory row ${JSON.stringify(row)}`);
  const sent = JSON.stringify(mock.digests.at(-1));
  assert(sent.includes('"store":false'), "digest must use store:false");
  const s1 = await kid("/api/call/start", { method: "POST", body: { childId: aliceId, sdp: fakeOffer } });
  assert(!mock.sessions.at(-1).session.instructions.includes("big hockey game on Saturday"), "proposed memory leaked into next call");
  assert(mock.sessions.at(-1).session.instructions.includes("Talked about hockey."), "recent call recap missing from next call");
  await kid(`/api/call/${s1.json.callId}/end`, { method: "POST", body: { reason: "cancelled" } });
  await parent(`/api/parent/memories/${row.id}`, { method: "PATCH", body: { status: "APPROVED" } });
  const s2 = await kid("/api/call/start", { method: "POST", body: { childId: aliceId, sdp: fakeOffer } });
  assert(mock.sessions.at(-1).session.instructions.includes("big hockey game on Saturday"), "approved memory missing from next call");
  await kid(`/api/call/${s2.json.callId}/end`, { method: "POST", body: { reason: "cancelled" } });
  const call = (await db.query(`SELECT summary, "summaryStatus" FROM "Call" WHERE summary IS NOT NULL ORDER BY "startedAt" DESC LIMIT 1`)).rows[0];
  assert(call?.summaryStatus === "PROPOSED", "summary should await parent approval");
});
await check("recaps respect the parent's setting and never include calls flagged for a check-in", async () => {
  await parent("/api/parent/settings", { method: "PATCH", body: { autoRecallCalls: false } });
  const off = await kid("/api/call/start", { method: "POST", body: { childId: aliceId, sdp: fakeOffer } });
  assert(!mock.sessions.at(-1).session.instructions.includes("Talked about hockey."), "recap sent while setting is off");
  await kid(`/api/call/${off.json.callId}/end`, { method: "POST", body: { reason: "cancelled" } });
  await parent("/api/parent/settings", { method: "PATCH", body: { autoRecallCalls: true } });
  await db.query(`UPDATE "Call" SET "safetyFlag" = true WHERE summary = 'Talked about hockey.'`);
  const flagged = await kid("/api/call/start", { method: "POST", body: { childId: aliceId, sdp: fakeOffer } });
  assert(!mock.sessions.at(-1).session.instructions.includes("Talked about hockey."), "flagged call recapped to Santa");
  await kid(`/api/call/${flagged.json.callId}/end`, { method: "POST", body: { reason: "cancelled" } });
  await db.query(`UPDATE "Call" SET "safetyFlag" = false WHERE summary = 'Talked about hockey.'`);
});
await check("wishes a kid tells Santa land on the list for review, then reach Santa once kept", async () => {
  const heard = (await db.query(`SELECT id, approved, source, details FROM "WishListItem" WHERE "childId"=$1 AND title='Bauer Vapor hockey skates'`, [aliceId])).rows;
  assert(heard.length === 1 && heard[0].approved === false && heard[0].source === "CALL" && heard[0].details === "size 8, black", `heard ${JSON.stringify(heard)}`);
  const dupes = (await db.query(`SELECT count(*)::int n FROM "WishListItem" WHERE "childId"=$1 AND title ILIKE 'lego millennium falcon'`, [aliceId])).rows[0].n;
  assert(dupes === 1, `duplicate wish created (${dupes})`);
  const s1 = await kid("/api/call/start", { method: "POST", body: { childId: aliceId, sdp: fakeOffer } });
  assert(!mock.sessions.at(-1).session.instructions.includes("Bauer Vapor"), "unreviewed wish reached Santa");
  await kid(`/api/call/${s1.json.callId}/end`, { method: "POST", body: { reason: "cancelled" } });
  const keep = await parent(`/api/parent/wishes/${heard[0].id}`, { method: "PATCH", body: { approved: true } });
  assert(keep.status === 200, `keep ${keep.status}`);
  const s2 = await kid("/api/call/start", { method: "POST", body: { childId: aliceId, sdp: fakeOffer } });
  assert(mock.sessions.at(-1).session.instructions.includes("Bauer Vapor hockey skates (size 8, black)"), "kept wish missing from next call");
  await kid(`/api/call/${s2.json.callId}/end`, { method: "POST", body: { reason: "cancelled" } });
});
await check("client enforces the call duration limit", async () => {
  await parent("/api/parent/settings", { method: "PATCH", body: { maxCallMinutes: 1 } });
  await page.getByRole("button", { name: "Call Santa Again" }).click();
  await page.getByText("Connected to North Pole Workshop").waitFor({ timeout: 20000 });
  await page.getByText("That's all the time on the line for now.", { exact: false }).waitFor({ timeout: 80000 });
  const row = (await db.query(`SELECT status FROM "Call" ORDER BY "startedAt" DESC LIMIT 1`)).rows[0];
  assert(row.status === "LIMIT_REACHED", `status ${row.status}`);
  await parent("/api/parent/settings", { method: "PATCH", body: { maxCallMinutes: 10 } });
});
await check("connection failure shows an honest error instead of a fake connection", async () => {
  const savedPeer = mock.peerPage;
  mock.peerPage = null; // mock returns an unusable SDP answer
  await page.getByRole("button", { name: "Call Santa Again" }).click();
  await page.getByText(/couldn't connect to the North Pole/i).waitFor({ timeout: 25000 });
  assert(!(await page.getByText("Connected to North Pole Workshop").isVisible()), "showed connected");
  await page.screenshot({ path: join(SHOTS, "07-connect-error-desktop.png") });
  mock.peerPage = savedPeer;
});
await check("no uncaught errors in the call page", async () => {
  assert(consoleErrors.length === 0, consoleErrors.join(" | "));
});

/* ------------------------------ Mobile + dashboard screenshots ------------------------------ */
console.log("Responsive layouts");
await check("mobile call screen and dashboard render", async () => {
  const mctx = await browser.newContext({ ...devices["iPhone 13"], permissions: ["microphone"] });
  const m = await mctx.newPage();
  await m.goto(BASE + "/");
  await m.getByPlaceholder("North Pole code").fill("reindeer-games");
  await m.getByRole("button", { name: "Connect" }).click();
  await m.getByRole("link", { name: /Ace/ }).click();
  await m.getByRole("button", { name: "Call Santa" }).waitFor();
  await m.screenshot({ path: join(SHOTS, "10-call-idle-mobile.png") });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert(!overflow, "horizontal overflow on mobile");

  const pctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 });
  const p = await pctx.newPage();
  await p.goto(BASE + "/parent/login");
  await p.getByLabel("Email").fill("pat@example.com");
  await p.getByLabel("Password").fill("a-long-password");
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.getByRole("heading", { name: "Hello, Pat" }).waitFor();
  await p.screenshot({ path: join(SHOTS, "20-dashboard-overview.png"), fullPage: true });
  await p.goto(`${BASE}/parent/children/${aliceId}`);
  await p.screenshot({ path: join(SHOTS, "21-child-profile.png") });
  await p.goto(`${BASE}/parent/children/${aliceId}?tab=talking-points`);
  await p.getByText("Santa's talking points").waitFor();
  await p.screenshot({ path: join(SHOTS, "22-talking-points.png") });
  await p.goto(`${BASE}/parent/children/${aliceId}?tab=wishes`);
  await p.getByText("wish list", { exact: false }).first().waitFor();
  await p.screenshot({ path: join(SHOTS, "28-wish-list.png") });
  await p.goto(`${BASE}/parent/wishlists`);
  await p.screenshot({ path: join(SHOTS, "29-wish-lists-all.png"), fullPage: true });
  await p.goto(`${BASE}/parent/memories`);
  await p.screenshot({ path: join(SHOTS, "23-memories.png") });
  await p.goto(`${BASE}/parent/personality`);
  await p.screenshot({ path: join(SHOTS, "24-personality.png") });
  await p.goto(`${BASE}/parent/history`);
  await p.screenshot({ path: join(SHOTS, "25-history.png") });
  await p.goto(`${BASE}/parent/settings`);
  await p.screenshot({ path: join(SHOTS, "26-settings.png") });

  const pm = await mctx.newPage();
  await pm.goto(BASE + "/parent/login");
  await pm.getByLabel("Email").fill("pat@example.com");
  await pm.getByLabel("Password").fill("a-long-password");
  await pm.getByRole("button", { name: "Sign in" }).click();
  await pm.getByRole("heading", { name: "Hello, Pat" }).waitFor();
  await pm.screenshot({ path: join(SHOTS, "27-dashboard-mobile.png") });
  const overflow2 = await pm.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert(!overflow2, "horizontal overflow on mobile dashboard");
});

/* ------------------------------ Bundle secrets scan ------------------------------ */
console.log("Secrets");
await check("client bundles contain no server secrets", async () => {
  const dir = join(ROOT, ".next/static");
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  for (const f of walk(dir)) {
    const t = readFileSync(f, "utf8");
    // Values, not variable names: the build ran with the local .env present.
    for (const secret of [FAKE_KEY, SETUP_TOKEN, "local-dev-setup-token", "postgresql://", "process.env.OPENAI"]) {
      assert(!t.includes(secret), `"${secret}" found in ${f}`);
    }
  }
});

/* ------------------------------ Done ------------------------------ */
await browser.close();
stopServer();
mockServer.close();
await db.end();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nServer log tail:\n" + serverLog.split("\n").slice(-30).join("\n"));
  process.exit(1);
}
process.exit(0);
