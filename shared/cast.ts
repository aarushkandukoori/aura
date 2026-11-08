/**
 * Shapes of the generated content files in content/.
 *
 * content/cast.json  - the named AI characters, written once by scripts/gen-cast.ts (Claude).
 * content/crowd.json - ~1,200 background followers, made by scripts/crowd.ts (no AI needed).
 * content/images/... - every picture, drawn by scripts/gen-images.ts (free FLUX model on AI Horde).
 *
 * The server copies these into the database when the user finishes onboarding
 * (server/seed). Image `file` values are root-relative URLs the server serves as static files.
 */
import type { Role } from './types.ts'

export interface CastImage {
  prompt: string             // full text-to-image prompt (the character's look already filled in)
  file: string               // e.g. "/content/images/maya/p3.webp"
  width: number
  height: number
}

export interface CastPost {
  id: string                 // e.g. "maya-p3"
  images: CastImage[]        // 1 = photo, 2-3 = carousel
  caption: string
  location: string | null
  released: boolean          // false = not posted yet; the simulation posts it live later
  daysAgo: number            // released posts: how long ago it was posted
  comments: { by: string; text: string }[] // seed comments; by = cast id or "crowd"
}

export interface CastStory {
  id: string                 // e.g. "maya-s1"
  image: CastImage
  text: string | null        // short text drawn over the story
}

export interface CastReel {
  id: string                 // e.g. "maya-r1"
  frames: CastImage[]        // 3 vertical images played as a motion reel
  caption: string
  audio: string              // "original audio" or a made-up track name
  released: boolean
  daysAgo: number
}

export interface CastPersona {
  id: string                 // short slug, also the account id
  username: string
  displayName: string
  role: Role
  age: number
  pronouns: string
  location: string
  occupation: string
  concept: string            // one-sentence pitch of who they are
  bio: string                // Instagram-style bio
  verified: boolean
  followers: number
  following: number
  look: string               // how they look, reused in every image prompt so they stay recognizable
  voice: string              // how they type
  traits: string[]
  interests: string[]
  relationship: string       // how they feel about / know the user
  avatar: CastImage
  posts: CastPost[]
  stories: CastStory[]
  reels: CastReel[]
}

export interface CastFile {
  version: 1
  generatedAt: string
  model: string
  personas: CastPersona[]
}

export interface CrowdAccount {
  id: string                 // "u0001"
  username: string
  displayName: string
  avatar: string | null      // one of the shared crowd avatars, or null for the default silhouette
}

export interface CrowdFile {
  version: 1
  accounts: CrowdAccount[]
  avatars: CastImage[]       // the shared pool of crowd profile pictures
  presets: CastImage[]       // avatars the user can pick during onboarding
}
