/**
 * Settings that come from the environment, plus the numbers that shape the simulation.
 * Every path is resolved from the project root, so the server works from any working directory.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AiModel, Speed, Tier } from '../shared/types.ts'

export const ROOT = fileURLToPath(new URL('..', import.meta.url))

const env = process.env

/** Every model Aura knows, in the order Settings lists them. */
const ALL_MODELS: AiModel[] = ['opus', 'sonnet', 'haiku']

/** "haiku, sonnet" -> ['sonnet', 'haiku'] (known names only, Settings order). Empty or unknown -> all of them. */
function modelList(text: string | undefined): AiModel[] {
  const names = (text ?? '').split(',').map((name) => name.trim().toLowerCase())
  const picked = ALL_MODELS.filter((model) => names.includes(model))
  return picked.length > 0 ? picked : ALL_MODELS
}

const allowedModels = modelList(env.AURA_ALLOWED_MODELS)
const wantedModel = (env.AURA_DEFAULT_MODEL ?? 'opus').trim().toLowerCase() as AiModel

/** Google sign-in needs both halves of the OAuth client. */
const google = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
  ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
  : null

/** AURA_PORT wins; hosting platforms (Render, Railway, Fly) tell apps their port in PORT. */
const port = Number(env.AURA_PORT ?? env.PORT ?? 8790)

/** "https://aura.example.com/" -> "https://aura.example.com". Unset: this machine. A typo stops the server right away. */
function publicUrlFrom(text: string | undefined): string {
  const value = (text ?? '').trim()
  if (!value) return `http://localhost:${port}`
  const url = URL.parse(value)
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
    throw new Error(`AURA_PUBLIC_URL must be a full address like https://aura.example.com (it is "${value}")`)
  }
  return url.origin
}

export const config = {
  port,
  /** 127.0.0.1 = only this Mac. Set AURA_HOST=0.0.0.0 to let a phone on your Wi-Fi connect (the Docker image does). */
  host: env.AURA_HOST ?? '127.0.0.1',
  /** Where the databases and uploads live. Each test run can point at its own folder. */
  dataDir: path.resolve(ROOT, env.AURA_DATA_DIR ?? 'data'),
  contentDir: path.join(ROOT, 'content'),
  webDist: path.join(ROOT, 'dist', 'web'),
  /** The address people open, like https://aura.example.com. Google sends people back here after sign-in. */
  publicUrl: publicUrlFrom(env.AURA_PUBLIC_URL),
  google,
  /** Tests only: POST /auth/dev signs anyone in without Google. Never on unless AURA_DEV_LOGIN=1. */
  devLogin: env.AURA_DEV_LOGIN === '1',
  /** Biggest photo or video one upload may be. */
  uploadLimitMb: Number(env.AURA_UPLOAD_LIMIT_MB ?? 150),
  ai: {
    /** AI calls at the same time, shared by every world. */
    concurrency: Number(env.AURA_AI_CONCURRENCY ?? 3),
    /** AI calls per world per day before its characters fall back to templates. */
    dailyCap: Number(env.AURA_AI_DAILY_CAP ?? 1500),
    /** With sign-in on: AI calls per day across every world together. */
    globalDailyCap: Number(env.AURA_AI_GLOBAL_DAILY_CAP ?? 5000),
    /** Models people may pick in Settings (a public server may allow only the cheap one). */
    allowedModels,
    /** The model a new world starts with. Must be one of the allowed ones. */
    defaultModel: allowedModels.includes(wantedModel) ? wantedModel : allowedModels[0],
  },
}

/**
 * Sign-in is on when Google is set up (or the test-only dev login is). Then every account gets its
 * own world. Off = local mode: no sign-in and one world in data/aura.db, like before accounts existed.
 */
export const authEnabled = config.google !== null || config.devLogin

/**
 * Popularity tiers. `likes` and the comment counts are per post (a random value in the range).
 * Named cast members always show up; the crowd numbers are what make big accounts feel big.
 */
export const TIERS: Record<Tier, {
  label: string
  blurb: string
  followers: number
  likes: [number, number]
  castComments: [number, number]   // comments written by named characters
  crowdComments: [number, number]  // AI-written comments from random followers
  emojiComments: [number, number]  // cheap "🔥🔥" / "omg" comments from random followers
  storyViews: [number, number]
}> = {
  rising:     { label: 'Rising',     blurb: 'Local legend. Everyone knows your name.', followers: 2_800,     likes: [180, 420],           castComments: [6, 9],   crowdComments: [2, 4],   emojiComments: [0, 2],     storyViews: [240, 520] },
  popular:    { label: 'Popular',    blurb: 'Campus famous. Your posts are an event.',  followers: 48_000,    likes: [2_400, 6_500],       castComments: [8, 12],  crowdComments: [4, 7],   emojiComments: [6, 12],    storyViews: [3_100, 7_800] },
  influencer: { label: 'Influencer', blurb: 'Brands DM you. Strangers know your face.', followers: 620_000,   likes: [28_000, 85_000],     castComments: [10, 14], crowdComments: [8, 12],  emojiComments: [30, 50],   storyViews: [41_000, 96_000] },
  icon:       { label: 'Icon',       blurb: 'A household name. Every post breaks the internet.', followers: 8_400_000, likes: [380_000, 1_200_000], castComments: [12, 16], crowdComments: [12, 18], emojiComments: [90, 140], storyViews: [610_000, 1_900_000] },
}

/**
 * Speed multiplies every simulated delay. "fast" turns one simulated hour into ~5 real minutes.
 * Chat replies use their own short real-time delays so conversations never feel sluggish.
 */
export const SPEEDS: Record<Speed, { label: string; factor: number }> = {
  realtime: { label: 'Real time', factor: 1 },
  fast:     { label: 'Fast',      factor: 0.08 },
  instant:  { label: 'Instant',   factor: 0.015 },
}

export const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000
