/**
 * Friends the user described at sign-up whom no character fits ("my best friend Jake, who lives
 * in sneaker stores"). Each one becomes a new character in their world, in steps that run as
 * background `new_friend` jobs (the welcome job starts the first, see server/sim/welcome.ts):
 *
 * 1. write - one AI call writes who they are (persona.ts). Their account appears right away,
 *            followed by the user, with a placeholder picture. Friends are written one at a time,
 *            so each one knows who is already there (two friends never get the same last name).
 * 2. draw  - AI Horde draws their profile picture and post photos (server/images), all at once,
 *            about 10-60 s each. The profile picture replaces the placeholder the moment it's
 *            ready. Pictures that fail are tried again a minute or two later (3 rounds at most).
 * 3. join  - their posts go live, they follow the user, a "<name> joined Aura" banner slides in,
 *            and their first DM arrives.
 *
 * Progress is saved in the settings table (one key per friend), so a restart carries on where it
 * stopped, and Start over (which wipes settings) quietly ends it. Pictures are saved in this
 * world's uploads folder and served from there like any upload.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Role, WorldPlan } from '../../shared/types.ts'
import { getSetting, newId, now, q, setSetting, tx } from '../db/index.ts'
import { drawImage, drawingEnabled, imageExtension, stylePrompt } from '../images/horde.ts'
import { broadcast } from '../live.ts'
import { broadcastAccount, followBack, getAccountRow, getCast, getPost, setFollow, showBanner, touchActive } from '../repo/index.ts'
import { currentUploads } from '../repo/files.ts'
import { randomInt } from '../repo/random.ts'
import { addNamedLikers, insertPost } from '../seed/posts.ts'
import { userInfo, worldStamp } from '../sim/context.ts'
import { castPostLikes } from '../sim/curve.ts'
import { planCastPost } from '../sim/posts.ts'
import { hasPending, schedule } from '../sim/scheduler.ts'
import { chatDelay } from '../sim/time.ts'
import { writeNewFriend, type NewFriendPersona } from './persona.ts'
import { freeUsername } from './username.ts'

const MINUTE = 60_000
/** Drawing rounds before a friend joins with whatever got drawn. */
const DRAW_ROUNDS = 3
const CLOSENESS: Partial<Record<Role, number>> = { bestie: 0.9, friend: 0.7, mutual: 0.4 }
const AVATAR = { width: 512, height: 512 }
const POST = { width: 768, height: 960 }

interface Picture {
  /** What to draw, with their look filled in (also kept as the post's description for later prompts). */
  prompt: string
  kind: 'avatar' | 'post'
  width: number
  height: number
  /** Set once it is drawn and saved. */
  url: string | null
}

interface NewFriend {
  key: string
  name: string
  description: string
  role: Role
  step: 'write' | 'draw' | 'joined'
  accountId: string | null
  /** [0] is the profile picture; post i uses pictures[i + 1]. */
  pictures: Picture[]
  posts: { caption: string; location: string | null }[]
  firstMessages: string[]
  rounds: number
}

const LIST_KEY = 'newFriends'
const settingKey = (key: string) => `newFriend:${key}`
const load = (key: string) => getSetting<NewFriend | null>(settingKey(key), null)
const save = (friend: NewFriend) => setSetting(settingKey(friend.key), friend)

/** When the world is built: remember who is coming (nothing runs until the welcome job). */
export function planNewFriends(people: WorldPlan['newFriends']): void {
  const keys = people.map((person, index) => {
    const key = `nf${index + 1}`
    save({
      key, name: person.name, description: person.description, role: person.role, step: 'write',
      accountId: null, pictures: [], posts: [], firstMessages: [], rounds: 0,
    })
    return key
  })
  setSetting(LIST_KEY, keys)
}

/** Called by the welcome burst: the first friend starts; each one's write step starts the next. */
export function scheduleNewFriends(): void {
  scheduleNextWriter(2_000)
}

/** The next friend still waiting to be written, if any (and not already scheduled). */
function scheduleNextWriter(delayMs: number): void {
  const next = getSetting<string[]>(LIST_KEY, []).find((key) => load(key)?.step === 'write')
  if (next && !hasPending('new_friend', 'newFriend', next)) schedule('new_friend', delayMs, { newFriend: next })
}

/** Job new_friend { newFriend: key } (server/sim/handlers.ts): whatever comes next for this friend. */
export async function continueNewFriend(key: string): Promise<void> {
  const friend = load(key)
  if (friend?.step === 'write') await writeStep(friend)
  else if (friend?.step === 'draw') await drawStep(friend)
}

// ----- 1. write ---------------------------------------------------------------------------------

async function writeStep(friend: NewFriend): Promise<void> {
  const world = worldStamp()
  const persona = await writeNewFriend(friend, userInfo(), getCast().map((member) => member.displayName))
  if (worldStamp() !== world || load(friend.key)?.step !== 'write') return // Start over (or a twin job) got here first
  const accountId = insertAccount(friend, persona)
  const pictures: Picture[] = drawingEnabled() && persona.look
    ? [
        { prompt: persona.avatarPrompt, kind: 'avatar', ...AVATAR, url: null },
        ...persona.posts.map((post): Picture => ({ prompt: post.imagePrompt, kind: 'post', ...POST, url: null })),
      ]
    : []
  save({
    ...friend, step: 'draw', accountId, pictures,
    posts: persona.posts.map((post) => ({ caption: post.caption, location: post.location })),
    firstMessages: persona.firstMessages,
  })
  // Without pictures to draw they would join the second the user arrives, lost in the welcome
  // messages; a short wait makes "<name> joined Aura" its own moment.
  schedule('new_friend', pictures.length > 0 ? 500 : chatDelay(20, 30), { newFriend: friend.key })
  scheduleNextWriter(1_000)
}

/** Their account: a character like the cast (persona JSON and all), followed by the user, no picture yet. */
function insertAccount(friend: NewFriend, persona: NewFriendPersona): string {
  const id = newId('nf')
  const time = now()
  const personality = {
    look: persona.look, voice: persona.voice, traits: persona.traits, interests: persona.interests,
    relationship: persona.relationship, concept: persona.concept, age: persona.age,
  }
  q(`INSERT INTO accounts (id, kind, username, display_name, avatar, bio, pronouns, location, occupation, verified, role,
       persona, followers, following, follows_me, i_follow, closeness, last_active_at, created_at)
     VALUES (?, 'cast', ?, ?, NULL, ?, ?, ?, ?, 0, ?, ?, ?, ?, 0, 0, ?, ?, ?)`).run(
    id, freeUsername([persona.username, persona.displayName]), persona.displayName, persona.bio, persona.pronouns,
    persona.location || null, persona.occupation || null, friend.role, JSON.stringify(personality),
    randomInt(40, 260), randomInt(90, 480), CLOSENESS[friend.role] ?? 0.7, time, time,
  )
  setFollow(id, true) // the user follows their friend; also updates the user's "following" count
  return id
}

// ----- 2. draw ----------------------------------------------------------------------------------

async function drawStep(friend: NewFriend): Promise<void> {
  const world = worldStamp()
  const missing = friend.pictures.flatMap((picture, index) => (picture.url ? [] : [index]))
  if (missing.length > 0) {
    await Promise.all(missing.map((index) => drawPicture(friend, index, world)))
    if (worldStamp() !== world) return
  }
  const latest = load(friend.key)
  if (latest?.step !== 'draw') return
  if (latest.pictures.some((picture) => !picture.url) && latest.rounds + 1 < DRAW_ROUNDS) {
    // The Horde may be busy or down: try the missing ones again in a minute or two.
    save({ ...latest, rounds: latest.rounds + 1 })
    schedule('new_friend', (latest.rounds + 1) * MINUTE, { newFriend: latest.key })
    return
  }
  joinAura(latest)
}

/** Draw one picture and save it. Never throws: a failure just leaves it for the next round. */
async function drawPicture(friend: NewFriend, index: number, world: number | null): Promise<void> {
  const picture = friend.pictures[index]
  try {
    const request = { prompt: stylePrompt(picture.prompt, picture.kind), width: picture.width, height: picture.height }
    const bytes = await drawImage(request, { attempts: 2 })
    const latest = load(friend.key)
    if (worldStamp() !== world || !latest) return
    const url = saveUpload(bytes)
    latest.pictures[index] = { ...latest.pictures[index], url }
    save(latest)
    // Their face replaces the placeholder everywhere right away.
    if (picture.kind === 'avatar' && latest.accountId) {
      q('UPDATE accounts SET avatar = ? WHERE id = ?').run(url, latest.accountId)
      broadcastAccount(latest.accountId)
    }
  } catch (error) {
    console.warn(`[onboarding] couldn't draw a picture of ${friend.name} yet: ${(error as Error).message}`)
  }
}

/** Save picture bytes in this world's uploads under a random name; returns the URL. */
function saveUpload(bytes: Buffer): string {
  const { folder, prefix } = currentUploads()
  const file = `${crypto.randomBytes(12).toString('base64url')}.${imageExtension(bytes)}`
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, file), bytes)
  return `${prefix}${file}`
}

// ----- 3. join ----------------------------------------------------------------------------------

function joinAura(friend: NewFriend): void {
  const account = friend.accountId ? getAccountRow(friend.accountId) : undefined
  if (!account) return
  const postIds = tx(() => {
    save({ ...friend, step: 'joined' })
    return insertPosts(friend, account.id, account.followers)
  })
  for (const id of postIds) {
    const post = getPost(id)
    if (post) broadcast({ type: 'post.new', post })
  }
  const newest = postIds.at(-1)
  if (newest) planCastPost(newest) // likes and comments roll in like on anyone's new post
  followBack(account.id) // "<username> started following you"
  touchActive(account.id)
  showBanner({
    title: `${account.display_name} joined Aura`, body: `@${account.username} is here. Say hi 👋`,
    avatar: account.avatar, href: `/${account.username}`,
  })
  if (friend.firstMessages.length > 0) {
    schedule('cast_dm', chatDelay(8, 14), { accountId: account.id, texts: friend.firstMessages, firstOnly: true })
  }
}

/**
 * Their posts whose photo got drawn, as if they posted them over the last few minutes. posts[0] is
 * the newest: it goes up last and starts fresh; the older ones already have likes from friends.
 * Returns the ids oldest first.
 */
function insertPosts(friend: NewFriend, authorId: string, followers: number): string[] {
  const time = now()
  const likers = getCast().filter((member) => member.id !== authorId && member.role !== 'creator').map((member) => member.id)
  // posts[i] uses pictures[i + 1]; a post whose photo never got drawn is left out.
  const drawn = friend.posts.flatMap((post, index) => {
    const picture = friend.pictures[index + 1]
    return picture?.url ? [{ post, picture, url: picture.url, number: index + 1 }] : []
  })
  // The newest went up just now; each older one 3-9 minutes before the one after it.
  let createdAt = time
  const timed = drawn.map((item, index) => {
    if (index > 0) createdAt -= randomInt(3, 9) * MINUTE
    return { ...item, createdAt, newest: index === 0 }
  })
  return timed.reverse().map(({ post, picture, url, number, createdAt, newest }) => {
    const id = insertPost({
      authorId, sourceId: `${friend.key}-p${number}`, kind: 'photo',
      media: [{ url, type: 'image', width: picture.width, height: picture.height }],
      caption: post.caption, location: post.location, audio: null, aiNote: picture.prompt, released: true, createdAt,
      likes: newest ? 0 : castPostLikes(followers, false), views: 0,
    })
    if (!newest) addNamedLikers(id, likers, createdAt, time)
    return id
  })
}
