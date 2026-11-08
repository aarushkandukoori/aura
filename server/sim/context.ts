/**
 * What the AI tasks need to know, read from the database: the user, which characters see a new
 * post first, a chat as prompt lines, what a post or story shows, and photo bytes for vision.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Media, Message, Role, Tier } from '../../shared/types.ts'
import type { ImageInput } from '../ai/llm.ts'
import type { ChatLine, UserInfo } from '../ai/prompts.ts'
import { TIERS } from '../config.ts'
import { getSetting, parseJson, q } from '../db/index.ts'
import {
  getAccountRow, getCast, getCastMember, getMemories, getMeRow, getMessages, getStoryRow, listConversations, mediaFilePath,
  type CastMember, type PostRow,
} from '../repo/index.ts'
import { pick, sample } from '../repo/random.ts'
import { loadContent } from '../seed/content.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

export const firstNameOf = (displayName: string) => displayName.split(' ')[0] || displayName

/** Cut long text for a prompt. */
export function short(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

function ago(time: number): string {
  const elapsed = Date.now() - time
  if (elapsed < HOUR) return `${Math.max(1, Math.round(elapsed / MINUTE))} min ago`
  if (elapsed < 24 * HOUR) return `${Math.round(elapsed / HOUR)} h ago`
  return `${Math.round(elapsed / (24 * HOUR))} days ago`
}

// ----- the user -------------------------------------------------------------------------------

/** Everything the prompts know about the user, or null before onboarding. */
export function userInfo(): UserInfo | null {
  const me = getMeRow()
  if (!me) return null
  const tier = getSetting<Tier>('tier', 'popular')
  return {
    name: me.display_name,
    firstName: firstNameOf(me.display_name),
    username: me.username,
    pronouns: me.pronouns,
    bio: me.bio,
    interests: getSetting<string[]>('interests', []),
    origin: getSetting('origin', 'college'),
    tierLabel: TIERS[tier].label,
    followers: me.followers,
    memories: getMemories('*', 8),
    recentPosts: recentPosts(3),
  }
}

/** My latest posts in a few words each: what they show (or the caption) and when. */
function recentPosts(limit: number): string[] {
  const rows = q("SELECT caption, ai_note, created_at FROM posts WHERE author_id = 'me' AND released = 1 ORDER BY created_at DESC LIMIT ?")
    .all(limit) as Pick<PostRow, 'caption' | 'ai_note' | 'created_at'>[]
  return rows.map((row) => {
    const what = [row.caption && `"${short(row.caption, 80)}"`, row.ai_note && short(row.ai_note, 160)].filter(Boolean).join(', ')
    return `${what || 'a photo'} (${ago(row.created_at)})`
  })
}

// ----- characters -----------------------------------------------------------------------------

/**
 * The character behind an account: a cast member, or a simple stand-in for a crowd follower
 * (the user can DM anyone, and somebody has to answer).
 */
export function characterFor(accountId: string): CastMember | null {
  const cast = getCastMember(accountId)
  if (cast) return cast
  const row = getAccountRow(accountId)
  if (!row || row.kind !== 'crowd') return null
  return {
    id: row.id, username: row.username, displayName: row.display_name, avatar: row.avatar, role: 'fan', closeness: 0,
    followsMe: row.follows_me === 1, iFollow: row.i_follow === 1, verified: false, followers: row.followers,
    following: row.following, bio: row.bio, pronouns: row.pronouns, location: row.location, occupation: row.occupation,
    lastActiveAt: row.last_active_at,
    persona: {
      look: '', age: 24, interests: [], traits: ['friendly', 'easygoing'],
      concept: "A regular person who follows the user's account and enjoys their posts.",
      voice: 'Casual lowercase texting, friendly, a little surprised and happy that the user is talking to them.',
      relationship: 'Follows the user and has never met them.',
    },
  }
}

export const isClose = (member: { role: Role }) => member.role === 'bestie' || member.role === 'friend'

/** What a group chat is about when it has no vibe of its own (e.g. a group the user started). */
export const DEFAULT_VIBE = 'friends catching up'

/**
 * About 14 people who see a new post of mine first: all besties, four friends, three mutuals,
 * two fans, and one creator (one I follow when possible).
 */
export function postAudience(): { audience: CastMember[]; creator: CastMember | null } {
  const cast = getCast()
  const withRole = (role: Role) => cast.filter((member) => member.role === role)
  const creators = withRole('creator')
  const followed = creators.filter((member) => member.iFollow)
  const creator = creators.length > 0 ? pick(followed.length > 0 ? followed : creators) : null
  const audience = [
    ...withRole('bestie'), ...sample(withRole('friend'), 4), ...sample(withRole('mutual'), 3), ...sample(withRole('fan'), 2),
    ...(creator ? [creator] : []),
  ]
  return { audience, creator }
}

/** The id of the DM with an account, if there is one (doesn't create it). */
export function findDmId(accountId: string): string | null {
  const dm = listConversations().find((conversation) => conversation.kind === 'dm' && conversation.members[0]?.id === accountId)
  return dm?.id ?? null
}

/**
 * Which world this is: when the user's account was made. It changes after Start over, so a job
 * that waited on the AI can tell that its world is gone before writing anything.
 */
export function worldStamp(): number | null {
  return getMeRow()?.created_at ?? null
}

// ----- posts and stories ----------------------------------------------------------------------

/** Library image prompts start with the character's full look; their first name reads better. */
function withName(note: string, authorId: string): string {
  const author = getCastMember(authorId)
  if (!author?.persona.look) return note
  return note.split(author.persona.look).join(firstNameOf(author.displayName))
}

/** What a post's picture shows (the AI's description for mine, the image prompt for characters'). */
export function describePost(row: Pick<PostRow, 'ai_note' | 'author_id'>): string {
  return row.ai_note ? short(withName(row.ai_note, row.author_id), 500) : 'a photo'
}

/** What a character's story shows, from the library prompt it was drawn from. */
function describeStory(storyId: string): string {
  const story = getStoryRow(storyId)
  if (!story) return 'a story that has expired'
  const overlay = parseJson<{ text?: string | null } | null>(story.overlay, null)
  const persona = loadContent().cast.find((person) => person.id === story.author_id)
  const prompt = persona?.stories.find((item) => item.id === story.source_id)?.image.prompt
  const picture = prompt ? short(withName(prompt, story.author_id), 300) : 'a photo'
  return overlay?.text ? `${picture}, with the text "${overlay.text}"` : picture
}

// ----- chats ----------------------------------------------------------------------------------

/** What a message carries besides text, in words: "[sent a photo]", "[shared a post by @maya: ...]". */
function attachmentNote(message: Message): string | null {
  const notes: string[] = []
  if (message.replyTo) notes.push(`(replying to ${message.replyTo.senderName}: "${short(message.replyTo.text, 80)}")`)
  if (message.story) {
    const ownerId = getStoryRow(message.story.id)?.author_id
    const owner = ownerId ? getAccountRow(ownerId)?.display_name : null
    notes.push(`[replying to ${owner ? `${firstNameOf(owner)}'s` : 'a'} story: ${describeStory(message.story.id)}]`)
  }
  if (message.media) notes.push(message.media.type === 'video' ? '[sent a video]' : '[sent a photo]')
  if (message.sharedPost) {
    const post = message.sharedPost
    const shows = post.author.kind === 'me' ? '' : `, showing ${describePost({ ai_note: noteOf(post.id), author_id: post.author.id })}`
    notes.push(`[shared a post by @${post.author.username}: "${short(post.caption, 120)}"${shows}]`)
  }
  return notes.length > 0 ? notes.join(' ') : null
}

function noteOf(postId: string): string | null {
  const row = q('SELECT ai_note FROM posts WHERE id = ?').get(postId) as { ai_note: string | null } | undefined
  return row?.ai_note ?? null
}

/** The last messages of a chat as prompt lines, oldest first. */
export function chatHistory(conversationId: string, limit = 30): ChatLine[] {
  const me = getMeRow()
  const myName = me ? firstNameOf(me.display_name) : 'Me'
  return getMessages(conversationId, limit).map((message) => ({
    id: message.id,
    senderId: message.sender.kind === 'me' ? 'me' : message.sender.id,
    name: message.sender.kind === 'me' ? myName : firstNameOf(message.sender.displayName),
    text: message.text,
    note: attachmentNote(message),
    picture: message.media !== null || message.sharedPost !== null,
  }))
}

/** Pictures in the user's newest messages, so the AI can see them: photos they sent, or a post of theirs they shared. */
export function latestUserImages(conversationId: string): ImageInput[] {
  const messages = getMessages(conversationId, 10)
  const lastOther = messages.findLastIndex((message) => message.sender.kind !== 'me')
  const media: Media[] = []
  for (const message of messages.slice(lastOther + 1)) {
    if (message.media) media.push(message.media)
    if (message.sharedPost?.author.kind === 'me') media.push(...message.sharedPost.media.slice(0, 1))
  }
  return imagesFor(media.slice(-2))
}

// ----- photos for vision ----------------------------------------------------------------------

const IMAGE_TYPES: Record<string, ImageInput['mediaType']> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
}
/** Bigger files are skipped (the model then goes by the caption). */
const MAX_IMAGE_BYTES = 4_500_000

/** Read up to `limit` photos for the AI to look at. Videos use their poster frame; other formats are skipped. */
export function imagesFor(media: Media[], limit = 3): ImageInput[] {
  const images: ImageInput[] = []
  for (const item of media) {
    if (images.length >= limit) break
    const url = item.type === 'video' ? item.poster : item.url
    const image = url ? readImage(url) : null
    if (image) images.push(image)
  }
  return images
}

function readImage(url: string): ImageInput | null {
  const file = mediaFilePath(url)
  const mediaType = file ? IMAGE_TYPES[path.extname(file).toLowerCase()] : undefined
  if (!file || !mediaType) return null
  try {
    if (fs.statSync(file).size > MAX_IMAGE_BYTES) return null
    return { data: fs.readFileSync(file), mediaType }
  } catch {
    return null // not drawn yet, or unreadable: the caption will have to do
  }
}
