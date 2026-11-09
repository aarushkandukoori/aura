# Aura

A social photo app where you are the main character. Post a photo and likes start pouring in,
friends comment on what is actually in the picture, your besties DM you about it, the group chat
talks about it, strangers follow you, and sometimes a big creator notices you.

Every account except yours is an AI character. There are 32 named characters (4 besties,
8 friends, 7 acquaintances, 5 fans, 8 verified creators), each with their own life, photos,
stories, reels and way of texting, plus 1,200 background followers. They also live on their own:
they post, put up stories, start conversations and talk to each other in group chats while you
watch or join in.

- Sign in with Google - every Google account gets its own private world.
- Describe your world - at sign-up you talk (or type) for about a minute about your friends, what
  you're into and how popular you want to be, and the AI builds that world.
- A recommendation algorithm - the feed, Explore, Reels and "Suggested for you" learn what you
  like from what you do and keep serving more of it.

It comes in two versions that share one server:

- Web app - desktop layout with a sidebar, and a phone layout with a bottom tab bar.
- iPhone app - native SwiftUI, same features, with Instagram-style motion (double-tap hearts,
  the story cube, stories that grow out of and shrink back into avatars, zoom from grid to post).

![Aura on the web: feed, a post with comments from the characters, a DM, and the phone layout](screenshots/web.jpg)

![Aura on iPhone: onboarding, feed, comments, stories, DMs, group chats, reels, profiles, settings](screenshots/iphone.jpg)

Try it at https://aura.tailcd5953.ts.net (sign in with Google; each account gets its own world).

![Sign in with Google, describe your world by talking or typing, a ranked feed that says why a post was suggested, and group chats built from your description](screenshots/web-v2.jpg)

![iPhone: sign in, tell it about your world, review the plan, build it, then the app](screenshots/iphone-v2.jpg)

![iPhone story viewer turning to the next person with a cube transition](screenshots/iphone-story-cube.jpg)

## Run it

You need Node 22.18+ (built with Node 25) and, for the iPhone app, Xcode 26 with XcodeGen
(`brew install xcodegen`).

```bash
npm install
npm run build
npm start
```

Open http://localhost:8790, describe your world (or set it up yourself), and post something. For
development with hot reload use `npm run dev` and open http://localhost:5190.

This is local mode: no sign-in and one world in `data/aura.db`. To put Aura on a public link with
Google sign-in, see [Put it online](#put-it-online).

### iPhone app

```bash
cd ios && xcodegen generate && open Aura.xcodeproj
```

Pick an iPhone simulator and press Run (iOS 18 or newer). The app talks to the server at
http://localhost:8790 (start it first with `npm start`). On a real iPhone:

1. Start the server so your phone can reach it: `AURA_HOST=0.0.0.0 npm start`.
2. In Xcode, choose your team under Signing & Capabilities.
3. In the app, open Settings and set the server address to `http://<your Mac's Wi-Fi IP>:8790`.

To build the app for a public server, set the `AURA_SERVER_URL` build setting (in
`ios/project.yml`, or `xcodebuild ... AURA_SERVER_URL=https://aura.example.com`). It ends up in the
app's Info.plist as `AuraServerURL`. The address in Settings (or the `-AuraServer` launch argument)
still wins over it. The app asks for the microphone and speech recognition only when you tap the
mic at sign-up. Simulator builds are signed "to run locally" (the Keychain, which keeps the sign-in
token, refuses unsigned apps), so they need no team; a real iPhone needs your team as above.

## Sign-in and accounts

Aura runs in one of two modes, picked when the server starts:

- Local mode (default) - no sign-in, one world in `data/aura.db`, uploads in `data/uploads/`.
- Sign-in mode - on when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. Everyone signs in
  with Google and each account gets its own world: `data/accounts.db` lists the accounts and
  sessions, and `data/worlds/<userId>/` holds that world's `aura.db` and `uploads/`.

How it works (`server/auth/`):

1. "Continue with Google" opens `GET /auth/google`. The server sends the browser to Google's
   account chooser with a random `state` and a PKCE secret kept in a short-lived cookie.
2. Google sends the browser back to `/auth/google/callback`. The server checks `state`, swaps the
   code for the account's name, email and picture (plain `fetch`, no SDK), and starts a session.
3. The web app gets the session in an HttpOnly cookie. The iPhone app signs in inside Apple's
   sign-in sheet (`ASWebAuthenticationSession`), gets `aura://auth?token=...`, keeps the token in
   the Keychain and sends it as `Authorization: Bearer` on every request.
4. Every API request then runs inside that account's world (`withWorld` in `server/db/index.ts`),
   so the same code serves everyone and no world can see another one. Signed out, every route
   except the session, health and preset avatars answers 401 and the apps show the sign-in screen.

Sessions last 90 days from last use and the server only stores a hash of each token. For tests
there is a dev login: with `AURA_DEV_LOGIN=1`, `POST /auth/dev {"email": "...", "platform": "web"}`
signs anyone in without Google (debug iPhone builds show a "Developer sign-in" link). Never turn it
on for a server other people can reach.

## Describe your world (sign-up)

After signing in, the first screen asks you to talk for about a minute: who your friends are,
what you're into, how popular you want to be.

1. The words appear live while you talk. The web uses the browser's speech recognition (Chrome,
   Edge and Safari; Firefox gets a text box); the iPhone uses Apple's Speech framework, on the
   device when it can. "Type instead" and three example ideas work everywhere.
2. "Build my world" sends the transcript to `POST /api/onboarding/plan`
   (`server/onboarding/plan.ts`). One AI call (about 20-30 s) turns it into a `WorldPlan`: your
   name, bio, interests and popularity, which characters are your besties and friends and how you
   know each of them, two to four group chats, facts every character knows about you, and friends
   you described whom no character fits. `cleanPlan()` checks every field. Without AI the plan
   comes from keyword rules in `offline.ts`.
3. You review it (change anything), then `POST /api/onboarding` builds the world from the plan:
   the chosen characters get their new roles and stories, the plan's group chats open, your
   besties DM first, and the welcome messages mention the things you said.
4. The friends no character fits ("my roommate Theo") join in the background as brand-new
   characters (`server/onboarding/new-friends.ts`, one `new_friend` job per step): the AI writes
   them, AI Horde draws their picture and a few posts, then "Theo joined Aura" slides in, they
   follow you and send their first DM.

"Set it up myself" skips the plan and asks the questions one by one instead.

## The recommendation algorithm

`server/recs/` learns what each person likes and ranks every list around it. Each world learns on
its own.

- What a post is about - every post gets up to 3 of 33 topics (food, coffee, pets, travel...)
  from keyword and emoji rules over the caption, hashtags, location and a note about the picture.
  The library's posts were also tagged once by AI (`npm run gen:topics` writes
  `content/topics.json`); those tags win when they exist.
- Signals - likes, saves, comments, shares and follows are read from their own API calls. The
  apps also send `POST /api/events` every 10 seconds (and when the app goes to the background):
  how long a post stayed on screen, opened posts, how much of a reel was watched, stories watched
  or skipped, profile visits, searches and hashtag pages.
- Weights - a share counts 4, a comment or save 3, a like 2, opening a post 1. A look counts from
  -0.2 (a quick scroll-past) to +0.8 (10 seconds or more), and a reel watched to the end 1.5.
  Each signal adds to the author's score and the post's topics, and every score halves every
  3 days, so recent taste counts most.
- Ranking - each list has one plain scoring function (`score.ts`): how much you like the author
  and the topics, popularity, freshness, a small bonus for something new and a penalty for posts
  you've seen. A few likes tilt a list toward a topic without taking it over, and the same author
  or topic never runs twice in a row while there is something else to show.
  - Home feed: your own new posts first, then the people you follow, with one suggested post after
    every four, labeled with why ("Because you like #coffee").
  - Explore: what you like most, plus one discovery tile in five (a popular post about a topic
    you haven't seen much).
  - Reels: ranked mostly by watch time.
  - Suggested for you: people you engage with and whose posts match your topics.
- The world leans in too - when a character posts from their library, the simulation picks what
  you'd most enjoy, and characters' prompts get a "Lately into: ..." line so friends bring those
  topics up on their own.

Paging is stable: one scroll session never shows a post twice, and every new page already uses
your newest signals.

## How the AI works

The characters' comments, DMs and group chats are written by an AI model. Aura picks a way to
reach one when the server starts:

- Your Claude Code login (default) - runs `claude -p` with every tool switched off and no
  CLAUDE.md loaded, so it is a plain "prompt in, JSON out" call. No API key needed. Set
  `AURA_CLAUDE_BIN` in `.env` if `claude` is not on your PATH.
- An API key - set `ANTHROPIC_API_KEY` to use the Claude API directly (faster), or
  `OPENAI_API_KEY` to use OpenAI instead (Settings' three sizes map to OpenAI models of the same
  size; `AURA_OPENAI_MODEL` picks one for everything).
- Offline - no AI at all (`AURA_PROVIDER=offline`). Characters answer from built-in templates.
  Everything still works, it is just less specific.

The default model is Claude Opus 5.5 at low effort (about 3-6 seconds per reply). Settings can
switch to Sonnet or Haiku (Haiku is the fastest and uses the least of your Claude usage). A
public server can limit the choice with `AURA_ALLOWED_MODELS`; with one model the picker hides.

Usage safety - AI calls only happen inside scheduled jobs, never while a page is loading. The one
exception is the sign-up plan, which runs when you press "Build my world" (at most 12 a day per
world). Characters only write new things on their own while the app is open and you have done
something in the last 15 minutes, so a forgotten tab goes quiet. At most 3 calls run at once, and
there is a daily cap per world (`AURA_AI_DAILY_CAP`, counted in the database so restarts don't
reset it) and, with sign-in, one for all worlds together (`AURA_AI_GLOBAL_DAILY_CAP`). After a
cap, characters fall back to templates and Settings says so. Photos you post and messages you send
go to the AI only so the characters can react to them.

Only Aura's own apps - the server answers only requests for localhost, `.local` names, IP
addresses and its public address (`AURA_PUBLIC_URL`), and changes must come from the app itself,
so another website can't reset your world.

## What happens when you post a photo

A concrete trace through the code (web version; iOS is the same from step 3 on):

1. `web/src/features/create/` - you pick a photo, crop it, pick a filter and write a caption.
   `web/src/lib/upload.ts` shrinks it to 1440 px and uploads it.
2. `web/src/lib/api.ts` calls `POST /api/posts`.
3. `server/api/posts.ts` checks the request, saves the post with `server/repo/posts.ts`, and calls
   `sim.onUserPost(postId)` from `server/sim/index.ts`. (With sign-in, all of this runs inside
   your world.)
4. That hook only adds a job, `post_react`, to the `jobs` table. The request returns right away.
5. `server/sim/scheduler.ts` checks the jobs every second (one timer for every world). It runs
   `reactToNewPost` in `server/sim/posts.ts`, which asks the AI (through `server/ai/tasks.ts` and
   `server/ai/llm.ts`) to look at your photo and write comments in each character's voice, DMs
   and group chat lines.
6. It schedules the reactions over time: likes in waves (most in the first minutes, then slowing
   down, like a real post), comments one by one, replies between characters, DMs with "typing...",
   new followers. Settings > World speed makes this faster or slower.
7. Each reaction is one call to a "world action" in `server/repo/` (for example `addPostLikes` or
   `addComment`). It updates the database, creates your notification, and calls
   `broadcast()` in `server/live.ts`.
8. Every open app holds one connection to `GET /api/live` (Server-Sent Events). The event arrives
   in `web/src/lib/live.ts`, goes into the store (`web/src/lib/store.ts`), and the post's like
   count ticks up on screen without a refresh.

## Where things live

```
shared/types.ts      The API contract: every shape the server sends. The web imports it directly;
                     the iPhone app mirrors it in ios/Aura/Core/Models.swift (+ SignUpModels.swift).
server/              Node + Express + SQLite (built-in node:sqlite). TypeScript runs directly, no build step.
  api/               HTTP routes, one file per area (posts, comments, stories, messages, events...)
  auth/              Google sign-in, sessions, the dev login
  db/                The databases: one per world (index.ts, schema.sql) and accounts.db (accounts.ts)
  repo/              Reading and writing the database, plus the "world actions" the simulation uses
  seed/              Builds your world when you finish onboarding (plan.ts applies a sign-up plan)
  onboarding/        "Describe your world": the plan, its checks, the offline version, new friends
  recs/              The recommendation algorithm: topics, signals, scores, ranking
  sim/               The simulation: job scheduler, reactions, characters living their lives
  ai/                AI prompts (prompts.ts), tasks (tasks.ts), offline templates (offline.ts)
  images/            Drawing pictures with AI Horde (new friends, and the generator script)
  live.ts            Live updates over Server-Sent Events
web/src/             React + Vite + Tailwind
  app/               Layout, navigation, routes, the session gate (sign-in and onboarding redirects)
  lib/               API client, store, live updates, uploads, tracking (track.ts), formatting
  components/        Shared UI pieces (avatars, sheets, buttons, the post grid...)
  features/          One folder per screen area (auth, feed, post, stories, create, profile, reels,
                     explore, activity, messages, onboarding, settings)
ios/                 SwiftUI app (project generated from ios/project.yml by XcodeGen)
  Aura/Core/         Models, API client, live stream, sign-in token, tracking, the app's store
  Aura/UI/           Shared views, the theme and the motion pieces (hearts, zooms, bubbles)
  Aura/Features/     One folder per screen area, same split as the web, plus SignIn
content/             The generated world: cast.json (characters), crowd.json, topics.json, images/
scripts/             The generators that made content/ (see below)
data/                Your worlds (not committed)
Dockerfile, render.yaml, DEPLOY.md   Putting Aura online
```

## The generated world

- `npm run gen:cast` - Claude writes the cast: who everyone is, how they look and type, their
  posts, stories, reels and the comments on their old posts. Results are cached in `content/.cache`.
- `npm run gen:images` - draws every picture with the FLUX.1 Schnell model on
  [AI Horde](https://aihorde.net), a free volunteer GPU network (no account needed). It skips
  pictures that already exist, so you can stop and rerun it any time to fill in missing ones.
- `npm run gen:topics` - tags every library post, reel and story with topics for the
  recommendation algorithm (about 5 AI calls). Rerun it after `gen:cast`, then restart the server.

## Settings

- Signed in as - your Google account, and Sign out (sign-in mode only).
- Popularity - Rising (2.8K followers), Popular (48K), Influencer (620K, verified) or Icon (8.4M).
- World speed - Real time, Fast (an hour of reactions in about 5 minutes) or Instant.
- AI model - Opus, Sonnet or Haiku (only the ones the server allows).
- Start over - wipes your world and goes back to onboarding.

## Put it online

[DEPLOY.md](DEPLOY.md) walks through it step by step:

1. Push the code to GitHub (the `origin` remote points at `github.com/aarushkandukoori/aura`).
2. Deploy the Docker image, for example with Render's Blueprint (`render.yaml`: one web service
   with a 1 GB disk at `/data` for every world). Railway and Fly work the same way.
3. Create a Google OAuth client with the redirect `https://<your address>/auth/google/callback`,
   then set `AURA_PUBLIC_URL`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

The server refuses to start on a public address while sign-in is off, so it can never hand one
shared world to everyone.

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `AURA_PORT` | 8790 | Server port (`PORT` is used when it is unset, as hosting platforms set it) |
| `AURA_HOST` | 127.0.0.1 | Use 0.0.0.0 to allow a phone on your Wi-Fi |
| `AURA_DATA_DIR` | data | Where the databases and uploads go |
| `AURA_PUBLIC_URL` | this Mac | The address people open, e.g. `https://aura.example.com` (Google returns there) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | unset | Turn on Sign in with Google (one world per account) |
| `AURA_DEV_LOGIN` | unset | Tests only: `1` lets `POST /auth/dev` sign in as any email |
| `AURA_PROVIDER` | auto | Force `anthropic`, `openai`, `claude-cli` or `offline` |
| `AURA_CLAUDE_BIN` | `claude` on PATH | Path to the Claude Code CLI |
| `ANTHROPIC_API_KEY` | unset | Use the Claude API |
| `OPENAI_API_KEY`, `AURA_OPENAI_MODEL` | unset | Use the OpenAI API (and optionally one model for everything) |
| `AURA_DEFAULT_MODEL` | opus | The model a new world starts with |
| `AURA_ALLOWED_MODELS` | all three | Comma list of models Settings may offer |
| `AURA_AI_CONCURRENCY` | 3 | AI calls at the same time |
| `AURA_AI_DAILY_CAP` | 1500 | AI calls per world per day before falling back to templates |
| `AURA_AI_GLOBAL_DAILY_CAP` | 5000 | With sign-in: AI calls per day for all worlds together |
| `AURA_IMAGES` | on (off when offline) | Draw pictures for friends created at sign-up (AI Horde) |
| `AURA_UPLOAD_LIMIT_MB` | 150 | Largest photo or video per upload |

## Checks

```bash
npm run typecheck   # server + web
npm test            # server tests (API, accounts and sign-in, worlds, onboarding, recommendations, scheduler)
npm run build       # web production build
```
