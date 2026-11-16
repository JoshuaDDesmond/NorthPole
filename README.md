# North Pole Direct Line

A private, mobile-first web app where your kids can call Santa Claus and have a real, two-way voice conversation. Santa already knows them, because you told him through a private parent dashboard called **Santa's Secret Book**.

- **Kids' side (`/`)**: a premium phone-call interface. Pick who's calling, tap the green button, talk.
- **Parents' side (`/parent`)**: profiles for each child, talking points, memory review, personality, call history, limits, and an emergency off switch. Several parents can each have their own login and manage only their own children.

No phone number or telephony service. Everything runs through the browser's microphone and speakers.

---

## What you need to set up (about 15 minutes)

1. **A PostgreSQL database.** Any provider works. Easiest on Vercel: *Project → Storage → Create Database → Neon (Free)*, connected to this project. It sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED` for you, and migrations automatically use the unpooled connection.
2. **An OpenAI API key** with access to the Realtime API (`gpt-realtime-2.1` by default). Create one at platform.openai.com → API keys. Add a few dollars of credit; a 10-minute call typically costs well under a dollar.
3. **Environment variables** on your host (see `.env.example`):
   | Variable | Required | Notes |
   |---|---|---|
   | `DATABASE_URL` | Yes | Postgres connection string |
   | `OPENAI_API_KEY` | Yes | Server-side only |
   | `SETUP_TOKEN` | Yes, first run | Any long random string. You type it once to create the first parent account |
   | `CRON_SECRET` | Recommended | Protects the nightly cleanup job |
   | `OPENAI_REALTIME_MODEL` etc. | No | Only if your account can't use the defaults |
4. **Deploy** (Vercel recommended, steps below).
5. **Open `/parent/setup`** on your deployed site, enter the `SETUP_TOKEN`, and create your account. You become the **owner**.
6. In Santa's Secret Book: **add your children**, **create your device code**, **confirm parent consent**, and optionally **upload your Santa photo** (Settings). The attached portrait is used until you do.
7. **Add the other parents** (Settings → Parents & access): give each a temporary password and pick which children they manage. On first sign-in they choose their own password, then create their own device code and confirm their own consent.
8. On each child's phone or tablet, open the site and **enter that child's parent's device code once**. That's it.

### Multiple parents

| | Owner | Parent |
|---|---|---|
| Sees and edits children | Every child in the family | Only children assigned to them (and ones they add) |
| Talking points, memories, call history | All children | Their children only |
| Device code | Their own; device shows children they manage | Their own; device shows children they manage |
| Add parents, assign children, reset passwords | Yes | No |
| Santa's voice and personality, call limits, photo, emergency off switch | Yes | No (view only) |
| Consent | Their own | Their own, required before their devices can call |
| Delete data | Their children, or the whole account | Their children only |

A child can be managed by more than one parent (for example, both Mom and Dad). There can be more than one owner, but never fewer than one. Removing a parent disconnects their devices; the children and their data stay.

### Deploying to Vercel

1. Import the GitHub repo in Vercel (framework is auto-detected as Next.js).
2. Add the environment variables above for Production.
3. Deploy. The `vercel-build` script runs `prisma migrate deploy` so the database tables are created automatically.
4. HTTPS is automatic on Vercel. Microphone access requires HTTPS, so always use the `https://` URL.

### Other hosts

Any Node 20+ host with Postgres works: `npm ci && npm run db:deploy && npm run build && npm start`. Put it behind HTTPS.

---

## How it works

### The voice engine
- The browser captures the mic and creates a WebRTC offer.
- It sends that offer to **our server** (`/api/call/start`), which checks the family device, the parent's switches and limits, assembles Santa's briefing for *only the child on the line*, and creates the Realtime call with OpenAI's unified WebRTC interface. The API key never leaves the server, and the browser never receives any credential at all, not even a short-lived one.
- OpenAI's answer comes back, the browser connects directly to OpenAI for low-latency audio, and the screen switches to **Connected** only after media and the event channel are actually up.
- **Turn-taking and interruptions** use OpenAI's semantic voice activity detection with `interrupt_response` on. Over WebRTC, OpenAI automatically truncates Santa's unplayed audio when your child starts talking.
- **Santa answers first**, then the conversation is fully live.
- **Mute** removes the mic track from the WebRTC sender, so no audio is transmitted at all.
- **Speaker**: where the browser supports choosing an output device (Chrome, Edge, Android), it opens a picker. On iPhone, where web apps can't switch earpiece/speaker, it toggles between full speakerphone volume and a quieter handset level.
- **Waveform** is drawn from an audio analyser on Santa's actual incoming audio. It's flat when he's silent.
- **Time limits** are enforced twice: in the browser (with a quiet wrap-up cue so Santa says goodbye naturally), and on the server, which hangs up the OpenAI call itself via heartbeat checks, the emergency switch, and a cleanup job.
- **Dropped lines** reconnect automatically once, carrying the last few lines of conversation so Santa picks up where he left off.

### Wish lists
Each child has a wish list (child page → **Wish List**, or **Wish Lists** for everyone at once). Add items with an optional link, private notes, a top-wish star and a "Got it" checkbox for coordinating between parents. When a child tells Santa about a new wish on a call, Santa confirms the specifics (brand, size, color) and it lands on the list marked "Heard on a call" for a parent to keep or remove. Santa sees only the wish and its details for items you've kept and allowed him to mention. He never sees links, private notes or what's been bought, and he never promises anything.

### What Santa knows
Four sources, assembled fresh for every call:
1. **The child's profile** (authoritative).
2. **Talking points** you write: enabled, unexpired, highest priority first, rotating ones already discussed.
3. **The wish list**: kept, mentionable items only (titles and details).
4. **Approved memories** only. After a call, a short summary and up to five *suggested* memories are generated and parked in your review queue. Nothing is used until you approve it.

Open any child → **Preview** to see the exact briefing Santa will receive.

### Privacy and safety
- No audio is ever recorded or stored. No transcripts are stored. The conversation text exists only in the browser during the call and, if memory suggestions are on, is sent once to generate the summary (`store: false`) and then discarded. You can switch this off entirely in Settings.
- Kids' devices pair with a **parent's device code**, separate from parent logins, and only show that parent's children. Device sessions can't touch any parent API, and changing a code disconnects that parent's devices.
- Every parent-facing API checks, on the server, that the signed-in parent manages the child in question. Family-wide settings and parent management are owner-only.
- Parent sessions use HttpOnly, SameSite cookies with 12-hour expiry, scrypt-hashed passwords, CSRF origin checks, and database-backed rate limiting.
- The whole site is `noindex`, with strict security headers and a locked-down content security policy.
- Santa is instructed never to promise gifts, use the naughty list as a threat, claim to watch the child, ask for personal info, or encourage secrets from parents. If asked directly, he says he's an AI version of Santa your family set up. If a child mentions something concerning, he encourages them to talk to a trusted adult, and the call is flagged for you in Call History.
- Each child gets a stable, anonymized safety identifier sent to OpenAI via its safety-identifier header, so OpenAI can apply per-user safety controls without knowing who the child is.
- Settings → **Delete data** removes call history, memories, all child data, or the entire account.

**Policy note.** OpenAI's terms set 13 as the minimum age and call for parental permission for minors (confirm the current wording before launch), and its developer guidance for developers serving minors calls for age-appropriate safeguards, AI disclosure and parental control, all of which this app implements. The app assumes every child you add is 13 or older. If you ever add a child under 13, OpenAI's guidance requires Zero Data Retention on your OpenAI organization first, so check that before enabling them.

### About the voice
Santa uses OpenAI's built-in **Cedar** voice by default (the deepest and warmest), selectable under Personality. If OpenAI has granted your organization a custom voice, paste its ID there. An ElevenLabs voice isn't plugged in, because it would mean replacing OpenAI's native speech-to-speech pipeline with a separate text-to-speech hop, which adds noticeable latency and weakens interruption handling. It's a reasonable phase-two upgrade if you find a voice you love.

---

## Development

```bash
cp .env.example .env            # fill in DATABASE_URL, OPENAI_API_KEY, SETUP_TOKEN
npm install
npm run db:migrate              # create tables
npm run dev                     # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm test` | Unit tests (prompt assembly, limits, validation, crypto, payloads) |
| `npm run build` | Production build |
| `npm run test:e2e` | Full acceptance suite (needs a build and a Postgres test DB; see below) |

The acceptance suite starts the production server, points it at a local mock of the OpenAI API, and uses a second headless Chromium page as the "OpenAI" WebRTC peer, so the real mic → WebRTC → audio path, mute, waveform, reconnect, limits and memory approval flow are all exercised. Set `TEST_DATABASE_URL` to an empty, migrated database.

### Project layout
```
prisma/                 schema + migrations
src/app/                pages and API routes
  page.tsx              family access → caller picker
  call/[childId]/       the call screen
  parent/               Santa's Secret Book (login, setup, dashboard)
  api/call/*            start / connected / heartbeat / end
  api/parent/*          parent-only CRUD (server-side authorization on every route)
src/components/call/    CallScreen, SantaContactPhoto, CallControls, CallTimer, AudioWaveform, ConnectionStatus, CallEndedScreen
src/components/parent/  dashboard, ChildProfileEditor, TalkingPointsEditor, MemoryReview, CallHistory, SantaPersonality, settings panels
src/lib/client/         VoiceSessionManager (WebRTC engine), ambience
src/lib/santa/          personality prompt builder, call context, post-call digest, voices
src/lib/openai/         Realtime call relay, hang-up, status
tests/                  unit + end-to-end acceptance
```
