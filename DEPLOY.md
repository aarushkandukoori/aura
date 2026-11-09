# Deploying Aura

Put Aura on a public link where anyone can sign in with Google and get their own private world.
It runs as one Docker container with a small persistent disk at `/data`. That disk holds
`accounts.db` (who can sign in) and one folder per account in `worlds/` with that world's
database and uploads.

You need:

- the code in a GitHub repository
- a Google Cloud project (free) for "Sign in with Google"
- an Anthropic API key (or an OpenAI API key) for the characters' writing (without one they write
  from templates)
- a host with a persistent disk. Render's Starter instance is about $7 a month; free instances
  have no disk and lose every account on each restart.

## 1. Push the code to GitHub

The project's `origin` remote already points at `https://github.com/aarushkandukoori/aura.git`.
If that repository doesn't exist yet, create it empty at [github.com/new](https://github.com/new)
with the name `aura` (it can be private), then run this in the project folder:

```bash
git push -u origin main
```

`.env`, `data/` and `node_modules/` are in `.gitignore`, so no secrets or worlds get uploaded.

## 2. Deploy on Render

1. In the [Render dashboard](https://dashboard.render.com): **New > Blueprint**, then connect the
   GitHub repository. Render reads `render.yaml`: one Docker web service named `aura` with a
   1 GB disk at `/data`.
2. Render asks for the secret values. For now, enter your `ANTHROPIC_API_KEY` (or
   `OPENAI_API_KEY` to use OpenAI instead) and leave the others empty. You fill in the Google ones
   during step 4.
3. Click **Apply**. The first build takes a few minutes. Your address appears at the top of the
   service page, for example `https://aura-x1y2.onrender.com`. Until step 4 it answers
   `{"error":"Unknown host"}`, which is expected.

## 3. Create the Google sign-in client

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create a project named
   **Aura**.
2. Go to **Google Auth Platform > Branding** and click **Get started**. Use app name **Aura**,
   your email as the support email, audience **External**, and your email as the contact. Skip
   the logo, because a logo means Google has to review the app first.
3. Go to **Data access**. Add only `openid`, `.../auth/userinfo.email` and
   `.../auth/userinfo.profile`. Google doesn't review these basic scopes, so the app can be
   public right away.
4. Go to **Audience** and click **Publish app**. While the app is in "Testing", only the test
   users you list can sign in.
5. Go to **Clients > Create client**:
   - Application type: **Web application**
   - Name: Aura
   - Authorized redirect URIs: `https://<your Render address>/auth/google/callback`.
     Add `http://localhost:8790/auth/google/callback` too if you want to try sign-in on your Mac.
6. Click **Create** and copy the **Client ID** and **Client secret**.

## 4. Connect them

1. In Render, open the `aura` service, then **Environment**, and set:
   - `AURA_PUBLIC_URL` = `https://<your Render address>` (no slash at the end)
   - `GOOGLE_CLIENT_ID` = the client ID
   - `GOOGLE_CLIENT_SECRET` = the client secret
2. Save. Render redeploys on its own.
3. Open your address and click **Continue with Google**. Every Google account gets its own
   world: the onboarding builds it, and nobody else can see it.

To check it from a terminal: `curl https://<your address>/api/health` should answer `"ok":true`.

## The iPhone app

Point the app at your server in one of two ways:

- Build it with your address baked in: `cd ios && xcodegen generate`, then build with
  `xcodebuild ... AURA_SERVER_URL=https://<your address>` (or change `AURA_SERVER_URL` in
  `ios/project.yml` and press Run in Xcode). The app reads it from its Info.plist (`AuraServerURL`).
- Or, in a build that points elsewhere, open Settings in the app and set the server address.

For a real iPhone, pick your team under Signing & Capabilities in Xcode. Signing in opens Google in
Apple's sign-in sheet, and the server hands the app its session at `aura://auth?token=...`. It uses
the same Google client (the redirect still goes to `/auth/google/callback` on your server), so
nothing else needs setting up.

## Other hosts

The same image runs anywhere that gives it a persistent volume at `/data`, and every host needs
the same environment variables (table below). Add `https://<that address>/auth/google/callback`
to the Google client's redirect URIs.

- **Railway**: New Project > Deploy from GitHub repo (it finds the Dockerfile). Add a volume
  (right-click the project canvas, or press ⌘K and type "volume"), attach it to the service, and
  set its mount path to `/data`. Under Settings > Networking, click **Generate Domain**, then add
  the variables, using that domain for `AURA_PUBLIC_URL`.
- **Fly.io**: run `fly launch --no-deploy` (keep internal port 8790), then
  `fly volumes create aura_data --size 1`, and add this to `fly.toml`:

  ```toml
  [mounts]
    source = "aura_data"
    destination = "/data"
  ```

  Then run `fly secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... ANTHROPIC_API_KEY=... AURA_PUBLIC_URL=https://<app>.fly.dev`
  and `fly deploy`.

## Environment variables

| Variable | Public server | Meaning |
|---|---|---|
| `AURA_PUBLIC_URL` | **required** | The address people open. Google sends people back to it after sign-in, and the server only accepts requests addressed to it (plus local names). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | **required** | Turn on Sign in with Google. Without both, Aura runs in local mode: no sign-in and one shared world. |
| `ANTHROPIC_API_KEY` | recommended | The characters' writing. Without it they use built-in templates. |
| `OPENAI_API_KEY` | instead of the above | Use OpenAI for the writing (used when there is no Anthropic key). `AURA_OPENAI_MODEL` picks one model for everything. |
| `AURA_IMAGES` | on | `off` stops drawing pictures (AI Horde) for friends created at sign-up. |
| `AURA_DEFAULT_MODEL` | `haiku` | The model a new world starts with: `opus`, `sonnet` or `haiku`. |
| `AURA_ALLOWED_MODELS` | `haiku` | Comma list of models people may pick in Settings. With one model, the picker is hidden. |
| `AURA_AI_DAILY_CAP` | `200` | AI calls per world per day (default 1500). After that, the world uses templates until tomorrow. |
| `AURA_AI_GLOBAL_DAILY_CAP` | `2000` | AI calls per day for all worlds together (default 5000), so the API bill has a ceiling. |
| `AURA_AI_CONCURRENCY` | `6` | AI calls running at the same time across all worlds (default 3). |
| `AURA_UPLOAD_LIMIT_MB` | `40` | Largest photo or video per upload (default 150). |
| `AURA_DATA_DIR`, `AURA_HOST`, `PORT` | set by the image | `/data`, `0.0.0.0` and 8790. Hosts that set `PORT` themselves win. |
| `AURA_DEV_LOGIN` | **never** | Tests only. `1` lets anyone sign in as any email. |

## Good to know

- **Sessions** last 90 days from last use. The web keeps its session in an HttpOnly cookie that
  is Secure on https. The iPhone app sends it as a Bearer token. The server stores only a hash.
- **Uploads** have long random file names. A link to one works for whoever has it, like on most
  photo apps, but no other world can use it in a post.
- **Disk**: a world takes about 1-5 MB plus its uploads, so 1 GB holds a few hundred people. You
  can make the disk bigger in Render at any time (never smaller). Render takes a daily snapshot
  of it.
- **Deploys**: with a disk, Render stops the old container before starting the new one, so each
  deploy means a few seconds of downtime. Open apps reconnect on their own.
- **Trying Google sign-in on your Mac**: put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in
  `.env`, run `npm run build && npm start`, and open http://localhost:8790. Each Google account
  then gets a new world in `data/worlds/`. Your old local world (`data/aura.db`) comes back as soon
  as you take the two lines out again. With `npm run dev` (port 5190), also set
  `AURA_PUBLIC_URL=http://localhost:5190` and register that redirect URI (the Vite dev server
  forwards `/auth` to the Node server).
