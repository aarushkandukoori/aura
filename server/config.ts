/**
 * Settings that come from the environment, plus the numbers that shape the simulation.
 * Every path is resolved from the project root, so the server works from any working directory.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Speed, Tier } from '../shared/types.ts'

export const ROOT = fileURLToPath(new URL('..', import.meta.url))

export const config = {
  port: Number(process.env.AURA_PORT ?? 8790),
  /** 127.0.0.1 = only this Mac. Set AURA_HOST=0.0.0.0 to let a phone on your Wi-Fi connect. */
  host: process.env.AURA_HOST ?? '127.0.0.1',
  /** Where the database and uploads live. Each test run can point at its own folder. */
  dataDir: path.resolve(ROOT, process.env.AURA_DATA_DIR ?? 'data'),
  contentDir: path.join(ROOT, 'content'),
  webDist: path.join(ROOT, 'dist', 'web'),
}

export const uploadsDir = path.join(config.dataDir, 'uploads')
export const dbFile = path.join(config.dataDir, 'aura.db')

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
