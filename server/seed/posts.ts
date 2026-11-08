/**
 * The characters' posts and reels at onboarding.
 *
 * Released ones get a believable past: a date, likes based on the author's follower count, a few
 * named likers and their seed comments. Unreleased ones wait in the library (released = 0) until
 * the simulation posts them.
 */
import type { CastImage, CastPersona } from '../../shared/cast.ts'
import type { Media } from '../../shared/types.ts'
import { bit, newId, q } from '../db/index.ts'
import { chance, pick, randomBetween, randomInt, sample } from '../repo/random.ts'
import { castPostLikes } from '../sim/curve.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Reel comments from strangers are short and generic in real life too. */
const REEL_REACTIONS = [
  '😭😭😭', 'obsessed with this', 'the last frame 💀', 'need a part 2', '🔥🔥🔥', 'ok but the vibes',
  'saving this', 'this made my day', 'the editing!!', 'came back to watch this again', 'how is this so good',
  '🙌🙌', 'not me watching this 5 times', 'this is everything ✨',
]

/**
 * A few generated captions and comments talk about "the user" (the person playing). Use their
 * first name instead, so nobody reads "losing to the user on a Tuesday".
 */
function personalize(text: string, firstName: string): string {
  return text.replace(/\bthe user\b/gi, firstName)
}

export function imageMedia(image: CastImage): Media {
  return { url: image.file, type: 'image', width: image.width, height: image.height }
}

/** When a released post went up: `daysAgo` days back at a random hour, never in the future. */
function postedAt(daysAgo: number, time: number): number {
  const at = daysAgo > 0 ? time - daysAgo * DAY - randomInt(1, 20) * HOUR : time - randomBetween(0.5, 10) * HOUR
  return Math.min(at, time - 30 * MINUTE)
}

/** Likes scale with followers, the same way as on the posts characters make later. */
function likesFor(persona: CastPersona): number {
  return castPostLikes(persona.followers ?? 0, persona.role === 'creator')
}

interface SeedPost {
  authorId: string
  sourceId: string
  kind: 'photo' | 'carousel' | 'reel'
  media: Media[]
  caption: string
  location: string | null
  audio: string | null
  aiNote: string
  released: boolean
  createdAt: number
  likes: number
  views: number
}

function insertPost(post: SeedPost): string {
  const id = newId('p')
  q(`INSERT INTO posts (id, author_id, kind, media, caption, location, audio, like_count, view_count, ai_note, source_id, released, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, post.authorId, post.kind, JSON.stringify(post.media), post.caption, post.location, post.audio,
    post.likes, post.views, post.aiNote, post.sourceId, bit(post.released), post.createdAt,
  )
  return id
}

/** 2-6 other characters liked it some time after it went up. */
function addNamedLikers(postId: string, likerPool: string[], createdAt: number, time: number): void {
  for (const accountId of sample(likerPool, randomInt(2, 6))) {
    const likedAt = Math.min(createdAt + randomInt(1, 48 * 60) * MINUTE, time - MINUTE)
    q('INSERT INTO post_likes (post_id, account_id, created_at) VALUES (?, ?, ?)').run(postId, accountId, likedAt)
  }
}

/** Seed comments, in order, a few minutes to hours apart, each with a few likes. */
function addComments(postId: string, comments: { authorId: string; text: string }[], persona: CastPersona, createdAt: number, time: number): void {
  let at = createdAt
  for (const comment of comments) {
    at += randomInt(2, 60) * MINUTE
    const likes = persona.role === 'creator' ? randomInt(4, 300) : randomInt(0, 9)
    q(`INSERT INTO comments (id, post_id, author_id, text, like_count, liked_by_author, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(newId('cm'), postId, comment.authorId, comment.text, likes, bit(chance(0.35)), Math.min(at, time - MINUTE))
  }
  q('UPDATE posts SET comment_count = ? WHERE id = ?').run(comments.length, postId)
}

/** Every character's posts and reels: released ones with history, the rest in the library. */
export function seedPosts(cast: CastPersona[], crowdIds: string[], time: number, userFirstName: string): void {
  const castIds = new Set(cast.map((persona) => persona.id))
  for (const persona of cast) {
    const likerPool = cast.filter((other) => other.id !== persona.id).map((other) => other.id)

    for (const post of persona.posts ?? []) {
      const media = post.images.map(imageMedia)
      const createdAt = post.released ? postedAt(post.daysAgo, time) : time
      const id = insertPost({
        authorId: persona.id,
        sourceId: post.id,
        kind: media.length > 1 ? 'carousel' : 'photo',
        media,
        caption: personalize(post.caption, userFirstName),
        location: post.location,
        audio: null,
        aiNote: post.images.map((image) => image.prompt).join(' | '),
        released: post.released,
        createdAt,
        likes: post.released ? likesFor(persona) : 0,
        views: 0,
      })
      if (!post.released) continue
      addNamedLikers(id, likerPool, createdAt, time)
      // "crowd" comments get a random background follower as their author.
      const comments = post.comments.flatMap((comment) => {
        const authorId = castIds.has(comment.by) ? comment.by : crowdIds.length > 0 ? pick(crowdIds) : null
        return authorId ? [{ authorId, text: personalize(comment.text, userFirstName) }] : []
      })
      addComments(id, comments, persona, createdAt, time)
    }

    for (const reel of persona.reels ?? []) {
      const likes = reel.released ? likesFor(persona) : 0
      const createdAt = reel.released ? postedAt(reel.daysAgo, time) : time
      const id = insertPost({
        authorId: persona.id,
        sourceId: reel.id,
        kind: 'reel',
        media: reel.frames.map(imageMedia),
        caption: personalize(reel.caption, userFirstName),
        location: null,
        audio: reel.audio === 'original audio' ? `original audio · ${persona.username}` : reel.audio,
        aiNote: reel.frames.map((frame) => frame.prompt).join(' | '),
        released: reel.released,
        createdAt,
        likes,
        views: likes * randomInt(5, 12),
      })
      if (!reel.released) continue
      addNamedLikers(id, likerPool, createdAt, time)
      const reactions = crowdIds.length > 0 ? sample(REEL_REACTIONS, randomInt(2, 4)) : []
      addComments(id, reactions.map((text) => ({ authorId: pick(crowdIds), text })), persona, createdAt, time)
    }
  }
}
