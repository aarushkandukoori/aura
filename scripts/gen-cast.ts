/**
 * Writes the cast: every named AI character, their posts, stories, reels and seed comments.
 *
 *   npm run gen:cast                 # whole cast (reuses anything already cached)
 *   npm run gen:cast -- --only maya  # redo one character
 *   npm run gen:cast -- --fresh      # ignore the cache and start over
 *
 * Step 1 asks Claude for the roster (32 people, their roles and voices).
 * Step 2 asks for each person's full profile, in parallel. Each answer is cached in
 * content/.cache/ so a crash or a rerun never pays for the same work twice.
 * Step 3 assembles content/cast.json and content/crowd.json (image prompts included).
 * Then run `npm run gen:images` to draw every picture.
 */
import fs from 'node:fs'
import path from 'node:path'
import { askJson, MODEL_IDS } from '../server/ai/llm.ts'
import { ROOT } from '../server/config.ts'
import type { CastFile, CastImage, CastPersona, CrowdFile } from '../shared/cast.ts'
import type { Role } from '../shared/types.ts'
import { crowdAvatarPrompts, makeCrowd, presetAvatarPrompts } from './crowd.ts'

const CONTENT = path.join(ROOT, 'content')
const CACHE = path.join(CONTENT, '.cache')
fs.mkdirSync(CACHE, { recursive: true })

const args = process.argv.slice(2)
const fresh = args.includes('--fresh')
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const PARALLEL = 6

const SYSTEM = `You are the writers' room for Aura, a social app where the person using it ("the user") is the main character and every other account is a fictional person you invent.
Make people feel real: specific jobs, neighborhoods, pets, routines, running jokes, and a distinct way of typing for each person.
Everyone is an adult (19+), fictional, and not based on any real person, celebrity or brand.
Keep it PG-13: warm, funny, a little messy, never cruel, never sexual.
Image prompts describe ordinary smartphone photos: no text, signs, logos or brand names in the picture; no swimwear, lingerie or shirtless people; nobody under 19.`

// How much each role posts. "upcoming" posts are held back and posted live while the user is on the app.
const PLAN: Record<Role, { posts: number; upcoming: number; stories: number; reels: number; followers: string }> = {
  bestie:  { posts: 10, upcoming: 3, stories: 3, reels: 1, followers: '600-2,500' },
  friend:  { posts: 9,  upcoming: 3, stories: 3, reels: 1, followers: '400-2,000' },
  mutual:  { posts: 7,  upcoming: 2, stories: 3, reels: 0, followers: '300-1,800' },
  fan:     { posts: 5,  upcoming: 2, stories: 2, reels: 0, followers: '90-1,100' },
  creator: { posts: 11, upcoming: 4, stories: 3, reels: 2, followers: '80,000-4,200,000' },
}

interface RosterEntry {
  id: string
  username: string
  displayName: string
  role: Role
  age: number
  pronouns: string
  location: string
  occupation: string
  concept: string
  voice: string
  interests: string[]
}

interface Details {
  bio: string
  look: string
  traits: string[]
  relationship: string
  followers: number
  following: number
  avatarPrompt: string
  posts: { imagePrompts: string[]; caption: string; location: string; released: boolean; daysAgo: number; comments: { by: string; text: string }[] }[]
  stories: { imagePrompt: string; text: string }[]
  reels: { framePrompts: string[]; caption: string; audio: string; released: boolean; daysAgo: number }[]
}

const str = { type: 'string' }
const int = { type: 'integer' }
const bool = { type: 'boolean' }
const list = (items: object) => ({ type: 'array', items })

const ROSTER_SCHEMA = {
  type: 'object',
  properties: {
    cast: list({
      type: 'object',
      properties: {
        id: str, username: str, displayName: str,
        role: { type: 'string', enum: ['bestie', 'friend', 'mutual', 'fan', 'creator'] },
        age: int, pronouns: str, location: str, occupation: str, concept: str, voice: str,
        interests: list(str),
      },
    }),
  },
}

const DETAILS_SCHEMA = {
  type: 'object',
  properties: {
    bio: str, look: str, traits: list(str), relationship: str, followers: int, following: int, avatarPrompt: str,
    posts: list({
      type: 'object',
      properties: {
        imagePrompts: list(str), caption: str, location: str, released: bool, daysAgo: int,
        comments: list({ type: 'object', properties: { by: str, text: str } }),
      },
    }),
    stories: list({ type: 'object', properties: { imagePrompt: str, text: str } }),
    reels: list({ type: 'object', properties: { framePrompts: list(str), caption: str, audio: str, released: bool, daysAgo: int } }),
  },
}

function readCache<T>(name: string): T | null {
  const file = path.join(CACHE, name)
  if (fresh || !fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T
}
function writeCache(name: string, value: unknown) {
  fs.writeFileSync(path.join(CACHE, name), JSON.stringify(value, null, 2))
}

// ----- step 1: the roster ----------------------------------------------------------------------

async function getRoster(): Promise<RosterEntry[]> {
  const cached = readCache<RosterEntry[]>('roster.json')
  if (cached) return cached
  console.log('Writing the roster...')
  const answer = await askJson<{ cast: RosterEntry[] }>({
    label: 'roster',
    system: SYSTEM,
    effort: 'medium',
    timeoutMs: 300_000,
    schema: ROSTER_SCHEMA,
    prompt: `Create the cast of Aura: exactly 32 fictional people who follow, comment on and message the user.

Roles (exact counts):
- 4 "bestie": the user's inner circle. Chaotic, loving, always in the group chat, hype the user up and roast them gently.
- 8 "friend": real friends from different parts of life (school, work, the gym, a hobby, a former roommate...).
- 7 "mutual": friendly acquaintances who like most posts and sometimes comment.
- 5 "fan": people who admire the user from afar. Sweet and starstruck, never creepy.
- 8 "creator": verified creators with big followings, each in a different niche (for example street photography, home cooking, travel, fitness, fashion, illustration, indie music, comedy).

Make the group diverse: about half women and half men plus two non-binary people; many ethnicities and body types; ages 19-34 (creators up to 38); mostly US cities plus a few international ones.
Give everyone a different personality and texting style: lowercase gremlins, proper-grammar people, ALL CAPS hype people, dry one-liners, emoji maximalists, people who send three texts in a row.
The user could be anyone, so the cast should work for a user of any gender.

For each person return:
- id: short lowercase slug, usually the first name, unique
- username: a realistic, unique Instagram handle (lowercase letters, numbers, dots, underscores; no @)
- displayName, role, age, pronouns, location (city), occupation
- concept: one specific sentence about who they are
- voice: one sentence on exactly how they type (case, punctuation, slang, emoji habits)
- interests: 3-5 short interests`,
  })
  const roster = answer.cast.slice(0, 32)
  writeCache('roster.json', roster)
  return roster
}

// ----- step 2: each person's profile -------------------------------------------------------------

async function getDetails(person: RosterEntry, roster: RosterEntry[]): Promise<Details> {
  const cacheName = `persona-${person.id}.json`
  const cached = only === person.id ? null : readCache<Details>(cacheName)
  if (cached) return cached

  const plan = PLAN[person.role]
  const others = roster
    .filter((other) => other.id !== person.id)
    .map((other) => `- ${other.id} (@${other.username}, ${other.role}): ${other.voice}`)
    .join('\n')

  const answer = await askJson<Details>({
    label: `persona ${person.id}`,
    system: SYSTEM,
    effort: 'medium',
    timeoutMs: 300_000,
    schema: DETAILS_SCHEMA,
    prompt: `Write the full Aura profile for ${person.displayName} (@${person.username}).
Role: ${person.role}. Age ${person.age}, ${person.pronouns}, lives in ${person.location}, works as: ${person.occupation}.
Who they are: ${person.concept}
How they type: ${person.voice}
Interests: ${person.interests.join(', ')}

The rest of the cast (they may comment on this person's posts):
${others}

Return:
- bio: Instagram bio, max 120 characters, in their style (emojis and " | " separators welcome).
- look: 25-40 words describing exactly how they look in photos (age, ethnicity, face, hair, build, signature style) so every picture shows the same person.
- traits: 3-5 personality traits.
- relationship: one sentence on how they know and feel about the user, written as "the user" (for a ${person.role}).
- followers and following: realistic numbers (followers ${plan.followers}).
- avatarPrompt: their profile picture. Start with the word PERSON (we replace it with their look).
- posts: exactly ${plan.posts} posts from their grid, newest first, matching their life and interests: selfies, friends, food, places, pets, hobbies, outfits, views, little moments.
  - imagePrompts: usually 1; for at most 2 posts give 2-3 (a carousel). Describe one concrete smartphone photo each: subject, setting, light, framing. When the person is in the photo, start with PERSON. About 40% include PERSON; the rest are point-of-view shots (food, views, objects, pets, hands, crowds).${person.role === 'creator' ? ' This is a creator: photos are striking and polished for their niche.' : ''}
  - caption: in their voice. Mix lengths: some one word or just emojis, some a sentence or two, a few with 1-3 hashtags.
  - location: a place name, or "" for none.
  - released: false for the ${plan.upcoming} newest posts (they will be posted live later), true for the rest.
  - daysAgo: 0 for unreleased posts; released posts spread from 2 to 120 days ago.
  - comments: for released posts only, 2-5 comments from OTHER cast members (use their id in "by") written in each commenter's voice and reacting to what is actually in the photo. You may use "crowd" for a random follower. Unreleased posts get [].
- stories: exactly ${plan.stories} stories, each a vertical everyday photo (imagePrompt, PERSON allowed) plus a short text overlay or "".
- reels: exactly ${plan.reels} reels. Each has 3 vertical framePrompts that tell a tiny sequence (getting ready, a day out, cooking steps, a trip), a caption, and an audio label ("original audio" or an invented song like "Velvet Static - Neon Hours"). The first reel is released (daysAgo 3-60); any second reel is unreleased (daysAgo 0).`,
  })
  writeCache(cacheName, answer)
  return answer
}

// ----- step 3: assemble -------------------------------------------------------------------------

const POST_SIZE = { width: 768, height: 960 }   // 4:5 portrait, like most feed photos
const TALL_SIZE = { width: 576, height: 1024 }  // 9:16 for stories and reels
const AVATAR_SIZE = { width: 512, height: 512 }

function image(id: string, slot: string, prompt: string, look: string, size: { width: number; height: number }): CastImage {
  const filled = prompt.includes('PERSON') ? prompt.replaceAll('PERSON', look) : prompt
  return { prompt: filled, file: `/content/images/${id}/${slot}.webp`, ...size }
}

function assemble(person: RosterEntry, details: Details, roster: RosterEntry[]): CastPersona {
  const look = details.look.trim().replace(/\.$/, '')
  const plan = PLAN[person.role]
  // Comment authors come back as ids ("maya") or usernames ("mayaokonkwo_"); map both to ids.
  const idFor = new Map<string, string>()
  for (const other of roster) {
    idFor.set(other.id, other.id)
    idFor.set(other.username.replace(/^@/, '').toLowerCase(), other.id)
  }
  const author = (by: string): string | null => {
    if (by === 'crowd') return 'crowd'
    const id = idFor.get(by.replace(/^@/, '').toLowerCase())
    return id && id !== person.id ? id : null
  }
  const posts = details.posts.slice(0, plan.posts).map((post, index) => {
    const n = index + 1
    const images = post.imagePrompts.slice(0, 3).map((prompt, k) =>
      image(person.id, k === 0 ? `p${n}` : `p${n}-${k + 1}`, prompt, look, POST_SIZE),
    )
    return {
      id: `${person.id}-p${n}`,
      images,
      caption: post.caption,
      location: post.location?.trim() || null,
      released: post.released,
      daysAgo: post.released ? Math.max(1, post.daysAgo) : 0,
      comments: post.released
        ? post.comments.flatMap((c) => {
            const by = author(c.by)
            return by ? [{ by, text: c.text }] : []
          })
        : [],
    }
  })
  return {
    id: person.id,
    username: person.username.replace(/^@/, '').toLowerCase(),
    displayName: person.displayName,
    role: person.role,
    age: person.age,
    pronouns: person.pronouns,
    location: person.location,
    occupation: person.occupation,
    concept: person.concept,
    bio: details.bio,
    verified: person.role === 'creator',
    followers: details.followers,
    following: details.following,
    look,
    voice: person.voice,
    traits: details.traits,
    interests: person.interests,
    relationship: details.relationship,
    avatar: image(person.id, 'avatar', details.avatarPrompt, look, AVATAR_SIZE),
    posts,
    stories: details.stories.slice(0, plan.stories).map((story, index) => ({
      id: `${person.id}-s${index + 1}`,
      image: image(person.id, `s${index + 1}`, story.imagePrompt, look, TALL_SIZE),
      text: story.text?.trim() || null,
    })),
    reels: details.reels.slice(0, plan.reels).map((reel, index) => ({
      id: `${person.id}-r${index + 1}`,
      frames: reel.framePrompts.slice(0, 3).map((prompt, k) => image(person.id, `r${index + 1}-${k + 1}`, prompt, look, TALL_SIZE)),
      caption: reel.caption,
      audio: reel.audio || 'original audio',
      released: reel.released,
      daysAgo: reel.released ? Math.max(1, reel.daysAgo) : 0,
    })),
  }
}

async function main() {
  const roster = await getRoster()
  console.log(`Roster: ${roster.length} people (${roster.map((p) => p.id).join(', ')})`)

  // Run up to PARALLEL profile requests at a time.
  const details = new Map<string, Details>()
  const queue = roster.filter((p) => !only || p.id === only || readCache(`persona-${p.id}.json`))
  let done = 0
  async function worker() {
    for (let person = queue.shift(); person; person = queue.shift()) {
      try {
        details.set(person.id, await getDetails(person, roster))
        console.log(`  [${++done}/${roster.length}] ${person.id} ready`)
      } catch (error) {
        console.error(`  ${person.id} failed: ${(error as Error).message}`)
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker))

  const personas = roster.filter((p) => details.has(p.id)).map((p) => assemble(p, details.get(p.id)!, roster))
  const missing = roster.filter((p) => !details.has(p.id)).map((p) => p.id)
  if (missing.length) console.warn(`Missing profiles (rerun to retry): ${missing.join(', ')}`)

  const cast: CastFile = { version: 1, generatedAt: new Date().toISOString(), model: MODEL_IDS.opus, personas }
  fs.writeFileSync(path.join(CONTENT, 'cast.json'), JSON.stringify(cast, null, 2))

  const avatars = crowdAvatarPrompts(64)
  const crowd: CrowdFile = { version: 1, accounts: makeCrowd(1200, avatars.map((a) => a.file)), avatars, presets: presetAvatarPrompts() }
  fs.writeFileSync(path.join(CONTENT, 'crowd.json'), JSON.stringify(crowd, null, 2))

  const imageCount = personas.reduce((sum, p) => sum + 1 + p.posts.reduce((s, post) => s + post.images.length, 0) + p.stories.length + p.reels.reduce((s, r) => s + r.frames.length, 0), 0)
  console.log(`Wrote content/cast.json (${personas.length} people, ${imageCount} images to draw) and content/crowd.json (${crowd.accounts.length} followers).`)
}

await main()
