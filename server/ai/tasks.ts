/**
 * Every AI task in Aura: everything the characters write.
 *
 * Each task has a stable system prompt (SYSTEM in prompts.ts: the shared rules plus what this task
 * is for, so it can be cached), a compact prompt with the details, a small JSON schema for the
 * answer, a timeout, and an offline fallback (offline.ts) used whenever the model is unavailable,
 * too slow, or answers with something unusable. Answers are checked before use: only the people
 * asked about may speak, in their own typing style, and nobody repeats a line. Tasks run only
 * inside simulation jobs, never inside an HTTP request.
 */
import type { CastMember } from '../repo/index.ts'
import { keepVoice } from '../sim/voice.ts'
import { askJson, type ImageInput } from './llm.ts'
import * as offline from './offline.ts'
import { formatChat, personaCard, SYSTEM, userCard, type ChatLine, type UserInfo } from './prompts.ts'

// ----- shapes shared with the offline versions -------------------------------------------------

/** A comment in a plan. replyTo is the index of an earlier comment in the same list, or -1. */
export interface PlannedComment { by: string; text: string; replyTo: number }
/** One chat message from one character. */
export interface Line { by: string; text: string }
/** The bubbles one character sends in a DM. */
export interface DmPlan { by: string; messages: string[] }
export interface EmojiReaction { by: string; emoji: string }

// ----- small helpers ----------------------------------------------------------------------------

/** The model answered, but with nothing we can use (for example zero comments). */
class UnusableAnswer extends Error {}

/** Ask the model; on any failure (offline, timeout, unusable answer) use the offline version. */
async function withFallback<T>(label: string, ask: () => Promise<T>, fallback: () => T): Promise<T> {
  try {
    return await ask()
  } catch (error) {
    // llm.ts already logs failed calls; only explain the ones that failed here.
    if (error instanceof UnusableAnswer) console.warn(`[ai] ${label}: ${error.message}, using templates`)
    return fallback()
  }
}

const TEXT = { type: 'string' }
const TEXTS = { type: 'array', items: TEXT }
const idOf = (people: CastMember[]) => ({ type: 'string', enum: people.map((person) => person.id) })
const object = (properties: Record<string, unknown>) => ({ type: 'object', properties })
const listOf = (item: Record<string, unknown>) => ({ type: 'array', items: item })

const firstName = (member: CastMember) => member.displayName.split(' ')[0]
const cards = (people: CastMember[], user: UserInfo) => people.map((member) => personaCard(member, user.firstName)).join('\n')

/** Tidy a line the model wrote: trim, drop wrapping quotes, never "the user", cap the length. */
function tidy(text: unknown, max: number, userFirstName?: string): string {
  if (typeof text !== 'string') return ''
  let clean = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().replace(/^"(.*)"$/s, '$1')
  if (userFirstName) clean = clean.replace(/\bthe user\b/gi, userFirstName)
  return clean.slice(0, max).trim()
}

/** Who may speak in an answer, by id. Lines from anyone else the model names are dropped. */
const speakers = (people: CastMember[]) => new Map(people.map((member) => [member.id, member]))
const isClose = (member: CastMember) => member.role === 'bestie' || member.role === 'friend'

/** Messages that say something, tidied (in the speaker's style), never the same one twice, at most `max`. */
function cleanTexts(texts: unknown, max: number, userFirstName: string, speaker?: CastMember): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const text of Array.isArray(texts) ? texts : []) {
    const tidied = tidy(text, 600, userFirstName)
    const clean = speaker ? keepVoice(tidied, speaker) : tidied
    if (!clean || seen.has(clean.toLowerCase())) continue
    seen.add(clean.toLowerCase())
    result.push(clean)
  }
  return result.slice(0, max)
}

/** Comments from allowed speakers only, in their style, no repeats; replyTo indexes are fixed up after dropping any. */
function cleanComments(raw: PlannedComment[], allowed: Map<string, CastMember>, userFirstName: string): PlannedComment[] {
  const kept: PlannedComment[] = []
  const newIndex = new Map<number, number>()
  const seen = new Set<string>()
  raw.forEach((comment, index) => {
    const speaker = allowed.get(comment.by)
    const text = speaker ? keepVoice(tidy(comment.text, 400, userFirstName), speaker) : ''
    if (!text || seen.has(text.toLowerCase())) return
    seen.add(text.toLowerCase())
    const parent = comment.replyTo >= 0 && comment.replyTo < index ? newIndex.get(comment.replyTo) : undefined
    newIndex.set(index, kept.length)
    kept.push({ by: comment.by, text, replyTo: parent ?? -1 })
  })
  return kept
}

function cleanLines(raw: Line[], allowed: Map<string, CastMember>, userFirstName: string): Line[] {
  return raw.flatMap((line) => {
    const speaker = allowed.get(line.by)
    const text = speaker ? keepVoice(tidy(line.text, 500, userFirstName), speaker) : ''
    return text ? [{ by: line.by, text }] : []
  })
}

function cleanDms(raw: DmPlan[], allowed: Map<string, CastMember>, userFirstName: string): DmPlan[] {
  return raw.flatMap((dm) => {
    const speaker = allowed.get(dm.by)
    const messages = speaker ? cleanTexts(dm.messages, 3, userFirstName, speaker) : []
    return messages.length > 0 ? [{ by: dm.by, messages }] : []
  })
}

/** A single emoji (or a short run of them); anything else means "no reaction". */
function cleanEmoji(text: unknown): string {
  return typeof text === 'string' && /^\p{Extended_Pictographic}/u.test(text.trim()) ? text.trim().slice(0, 8) : ''
}

const KIND_LABELS = { photo: 'photo', carousel: 'carousel post', reel: 'reel (video)' }

// ----- 1. reactions to the user's post -----------------------------------------------------------

export interface PostReactionInput {
  user: UserInfo
  kind: 'photo' | 'carousel' | 'reel'
  caption: string
  location: string | null
  images: ImageInput[]
  /** About 14 people who see the post first: all besties, some friends, mutuals and fans, maybe a creator. */
  audience: CastMember[]
  castComments: number
  crowdComments: number
}

export interface PostReaction {
  description: string
  hype: number
  fact: string
  comments: PlannedComment[]
  crowdComments: string[]
  dms: DmPlan[]
  groupLines: Line[]
}

export function reactToMyPost(input: PostReactionInput): Promise<PostReaction> {
  const fallback = () => offline.reactToMyPost(input)
  if (input.audience.length === 0) return Promise.resolve(fallback())
  return withFallback('react-to-post', async () => {
    const first = input.user.firstName
    const where = input.location ? `, location "${input.location}"` : ''
    const prompt = [
      `The user:\n${userCard(input.user)}`,
      `${first}'s new ${KIND_LABELS[input.kind]}: caption "${input.caption || '(no caption)'}"${where}.`,
      input.images.length > 0
        ? `${input.images.length > 1 ? `The ${input.images.length} photos are` : 'The photo is'} attached.`
        : 'The photo could not be attached, so go by the caption.',
      `Characters who see it first:\n${cards(input.audience, input.user)}`,
      `Write ${input.castComments} comments and ${input.crowdComments} crowdComments.`,
    ].join('\n\n')
    const answer = await askJson<PostReaction>({
      label: 'react-to-post',
      system: SYSTEM.reactToMyPost,
      prompt,
      images: input.images,
      timeoutMs: 120_000,
      schema: object({
        description: TEXT,
        hype: { type: 'number' },
        fact: TEXT,
        comments: listOf(object({ by: idOf(input.audience), text: TEXT, replyTo: { type: 'integer' } })),
        crowdComments: TEXTS,
        dms: listOf(object({ by: idOf(input.audience), messages: TEXTS })),
        groupLines: listOf(object({ by: idOf(input.audience), text: TEXT })),
      }),
    })
    const comments = cleanComments(answer.comments, speakers(input.audience), first)
    if (comments.length === 0) throw new UnusableAnswer('no comments')
    const besties = input.audience.filter((member) => member.role === 'bestie')
    return {
      description: tidy(answer.description, 600),
      hype: Math.min(1.3, Math.max(0.8, Number(answer.hype) || 1)),
      fact: tidy(answer.fact, 160, first),
      comments,
      crowdComments: cleanTexts(answer.crowdComments, input.crowdComments + 2, first),
      dms: cleanDms(answer.dms, speakers(input.audience.filter(isClose)), first).slice(0, 3),
      groupLines: cleanLines(answer.groupLines, speakers(besties), first).slice(0, 4),
    }
  }, fallback)
}

// ----- 2. a character replies to a comment --------------------------------------------------------

export interface CommentReplyInput {
  user: UserInfo
  replier: CastMember
  /** "Maya's post" or "Sam's post". */
  postOwner: string
  /** The caption and what the photo shows. */
  post: string
  /** The thread so far, oldest first. */
  thread: { name: string; text: string }[]
  replyingTo: { name: string; text: string }
}

export function replyToComment(input: CommentReplyInput): Promise<{ text: string }> {
  return withFallback('comment-reply', async () => {
    const thread = input.thread.map((comment) => `${comment.name}: ${comment.text}`).join('\n')
    const prompt = [
      `Replying:\n${personaCard(input.replier, input.user.firstName)}`,
      `The user is ${input.user.name} (@${input.user.username}).`,
      `${input.postOwner}: ${input.post}`,
      `Comments so far:\n${thread}`,
      `Write ${firstName(input.replier)}'s reply to ${input.replyingTo.name}: "${input.replyingTo.text}"`,
    ].join('\n\n')
    const answer = await askJson<{ text: string }>({
      label: 'comment-reply', system: SYSTEM.replyToComment, prompt, timeoutMs: 45_000, schema: object({ text: TEXT }),
    })
    const text = keepVoice(tidy(answer.text, 300, input.user.firstName).replace(/^@[\w.]+\s*/, ''), input.replier)
    if (!text) throw new UnusableAnswer('empty reply')
    return { text }
  }, () => offline.replyToComment(input))
}

// ----- 3. a DM reply ------------------------------------------------------------------------------

export interface DmReplyInput {
  user: UserInfo
  character: CastMember
  memories: string[]
  history: ChatLine[]
  /** A photo the user just sent (or the picture of a post they shared), so the character can see it. */
  images: ImageInput[]
}

export interface DmReply {
  messages: string[]
  /** An emoji reaction to the user's last message, or "". */
  react: string
  /** New facts learned about the user. */
  memories: string[]
}

export function dmReply(input: DmReplyInput): Promise<DmReply> {
  return withFallback('dm-reply', async () => {
    const first = input.user.firstName
    const name = firstName(input.character)
    const prompt = [
      `You are:\n${personaCard(input.character, first)}`,
      `Texting with:\n${userCard(input.user)}`,
      `What ${name} remembers about ${first}: ${input.memories.length > 0 ? input.memories.join('; ') : 'nothing specific yet'}.`,
      `The chat so far (oldest first; ${first} is the user):\n${formatChat(input.history)}`,
      input.images.length > 0 ? 'The picture from their newest message is attached.' : '',
      `Write ${name}'s reply to ${first}'s newest message(s).`,
    ].filter(Boolean).join('\n\n')
    const answer = await askJson<DmReply>({
      label: 'dm-reply', system: SYSTEM.dmReply, prompt, images: input.images, timeoutMs: 60_000,
      schema: object({ messages: TEXTS, react: TEXT, memories: TEXTS }),
    })
    const messages = cleanTexts(answer.messages, 3, first, input.character)
    if (messages.length === 0) throw new UnusableAnswer('no messages')
    return { messages, react: cleanEmoji(answer.react), memories: cleanTexts(answer.memories, 4, first) }
  }, () => offline.dmReply(input))
}

// ----- 4. a group chat answers the user -----------------------------------------------------------

export interface GroupReplyInput {
  user: UserInfo
  title: string
  vibe: string
  members: CastMember[]
  history: ChatLine[]
  images: ImageInput[]
}

export interface GroupReply {
  lines: Line[]
  reactions: EmojiReaction[]
  memories: string[]
}

export function groupReply(input: GroupReplyInput): Promise<GroupReply> {
  const fallback = () => offline.groupReply(input)
  if (input.members.length === 0) return Promise.resolve(fallback())
  return withFallback('group-reply', async () => {
    const first = input.user.firstName
    const prompt = [
      `Group chat "${input.title}" (what it's about: ${input.vibe}).`,
      `Members:\n${cards(input.members, input.user)}`,
      `The user:\n${userCard(input.user)}`,
      `The chat so far (oldest first; ${first} is the user):\n${formatChat(input.history)}`,
      input.images.length > 0 ? 'The picture from their newest message is attached.' : '',
      'Write what happens next.',
    ].filter(Boolean).join('\n\n')
    const answer = await askJson<GroupReply>({
      label: 'group-reply', system: SYSTEM.groupReply, prompt, images: input.images, timeoutMs: 60_000,
      schema: object({
        lines: listOf(object({ by: idOf(input.members), text: TEXT })),
        reactions: listOf(object({ by: idOf(input.members), emoji: TEXT })),
        memories: TEXTS,
      }),
    })
    const members = speakers(input.members)
    const lines = cleanLines(answer.lines, members, first).slice(0, 4)
    if (lines.length === 0) throw new UnusableAnswer('no messages')
    return {
      lines,
      reactions: answer.reactions
        .map((reaction) => ({ by: reaction.by, emoji: cleanEmoji(reaction.emoji) }))
        .filter((reaction) => reaction.emoji && members.has(reaction.by))
        .slice(0, 2),
      memories: cleanTexts(answer.memories, 4, first),
    }
  }, fallback)
}

// ----- 5. a group chat talks on its own -----------------------------------------------------------

export interface GroupChatterInput {
  user: UserInfo
  title: string
  vibe: string
  members: CastMember[]
  history: ChatLine[]
  /** End by asking the user something. */
  askUser: boolean
}

export function groupChatter(input: GroupChatterInput): Promise<{ lines: Line[] }> {
  const fallback = () => offline.groupChatter(input)
  if (input.members.length < 2) return Promise.resolve(fallback())
  return withFallback('group-chatter', async () => {
    const first = input.user.firstName
    const prompt = [
      `Group chat "${input.title}" (what it's about: ${input.vibe}).`,
      `Members:\n${cards(input.members, input.user)}`,
      `The user is ${input.user.name} (@${input.user.username}): ${input.user.interests.join(', ')}.`,
      `Recent messages (oldest first; ${first} is the user):\n${formatChat(input.history.slice(-15))}`,
      input.askUser ? `Pull ${first} in at the end.` : `Don't involve ${first} this time.`,
    ].join('\n\n')
    const answer = await askJson<{ lines: Line[] }>({
      label: 'group-chatter', system: SYSTEM.groupChatter, prompt, timeoutMs: 60_000,
      schema: object({ lines: listOf(object({ by: idOf(input.members), text: TEXT })) }),
    })
    const lines = cleanLines(answer.lines, speakers(input.members), first).slice(0, 6)
    if (lines.length < 2) throw new UnusableAnswer('too few messages')
    return { lines }
  }, fallback)
}

// ----- 6. a character starts a DM -----------------------------------------------------------------

/** Why someone writes first: the user just followed them, or just liked their new post. */
export type OpenerReason = 'followed' | 'liked-post' | null

export interface DmOpenerInput {
  user: UserInfo
  character: CastMember
  memories: string[]
  history: ChatLine[]
  reason: OpenerReason
}

export function dmOpener(input: DmOpenerInput): Promise<{ messages: string[] }> {
  return withFallback('dm-opener', async () => {
    const first = input.user.firstName
    const name = firstName(input.character)
    const reason = input.reason === 'followed' ? `${first} just followed ${name}.`
      : input.reason === 'liked-post' ? `${first} just liked ${name}'s newest post.`
      : 'No special reason: they just felt like texting.'
    const prompt = [
      `You are:\n${personaCard(input.character, first)}`,
      `Texting:\n${userCard(input.user)}`,
      `What ${name} remembers about ${first}: ${input.memories.length > 0 ? input.memories.join('; ') : 'nothing specific yet'}.`,
      `Recent messages between them (oldest first):\n${formatChat(input.history.slice(-12))}`,
      `Reason: ${reason}`,
    ].join('\n\n')
    const answer = await askJson<{ messages: string[] }>({
      label: 'dm-opener', system: SYSTEM.dmOpener, prompt, timeoutMs: 60_000, schema: object({ messages: TEXTS }),
    })
    const messages = cleanTexts(answer.messages, 3, first, input.character)
    if (messages.length === 0) throw new UnusableAnswer('no messages')
    return { messages }
  }, () => offline.dmOpener(input))
}

// ----- 7. comments on a character's post ----------------------------------------------------------

export interface CastPostCommentsInput {
  user: UserInfo
  author: CastMember
  caption: string
  location: string | null
  /** What the photo shows (the image prompt it was drawn from). */
  description: string
  commenters: CastMember[]
  count: number
}

export function castPostComments(input: CastPostCommentsInput): Promise<{ comments: PlannedComment[] }> {
  const fallback = () => offline.castPostComments(input)
  if (input.commenters.length === 0) return Promise.resolve(fallback())
  return withFallback('cast-post-comments', async () => {
    const people = [input.author, ...input.commenters]
    const where = input.location ? ` Location: ${input.location}.` : ''
    const prompt = [
      `The author:\n${personaCard(input.author, input.user.firstName)}`,
      `The post: caption "${input.caption}".${where} The photo shows: ${input.description}`,
      `Commenters:\n${cards(input.commenters, input.user)}`,
      `Write ${input.count} comments.`,
    ].join('\n\n')
    const answer = await askJson<{ comments: PlannedComment[] }>({
      label: 'cast-post-comments', system: SYSTEM.castPostComments, prompt, timeoutMs: 60_000,
      schema: object({ comments: listOf(object({ by: idOf(people), text: TEXT, replyTo: { type: 'integer' } })) }),
    })
    const comments = cleanComments(answer.comments, speakers(people), input.user.firstName)
    if (comments.length === 0) throw new UnusableAnswer('no comments')
    return { comments }
  }, fallback)
}

// ----- 8. reactions to the user's story -----------------------------------------------------------

export interface StoryReactionsInput {
  user: UserInfo
  images: ImageInput[]
  overlayText: string | null
  /** Who might react: the closest people first. */
  viewers: CastMember[]
}

export interface StoryReactions {
  reactions: EmojiReaction[]
  replies: DmPlan[]
}

export function storyReactions(input: StoryReactionsInput): Promise<StoryReactions> {
  const fallback = () => offline.storyReactions(input)
  if (input.viewers.length === 0) return Promise.resolve(fallback())
  return withFallback('story-reactions', async () => {
    const first = input.user.firstName
    const prompt = [
      `The user:\n${userCard(input.user)}`,
      `${first}'s story${input.overlayText ? ` has the text "${input.overlayText}" on it` : ''}.`,
      input.images.length > 0 ? 'The picture is attached.' : 'The picture could not be attached, so go by the text.',
      `People who see it:\n${cards(input.viewers, input.user)}`,
    ].join('\n\n')
    const answer = await askJson<StoryReactions>({
      label: 'story-reactions', system: SYSTEM.storyReactions, prompt, images: input.images, timeoutMs: 90_000,
      schema: object({
        reactions: listOf(object({ by: idOf(input.viewers), emoji: TEXT })),
        replies: listOf(object({ by: idOf(input.viewers), messages: TEXTS })),
      }),
    })
    const viewers = speakers(input.viewers)
    const replies = cleanDms(answer.replies, speakers(input.viewers.filter(isClose)), first)
    return {
      reactions: answer.reactions
        .map((reaction) => ({ by: reaction.by, emoji: cleanEmoji(reaction.emoji) }))
        .filter((reaction) => reaction.emoji && viewers.has(reaction.by))
        .slice(0, 5),
      replies: replies.slice(0, 2),
    }
  }, fallback)
}

// ----- 9. the welcome burst after onboarding ------------------------------------------------------

export interface WelcomeGroup { id: string; title: string; vibe: string; members: CastMember[] }

export interface WelcomeInput {
  user: UserInfo
  groups: WelcomeGroup[]
  besties: CastMember[]
  fan: CastMember | null
}

export interface Welcome {
  groups: { conversationId: string; lines: Line[] }[]
  dms: DmPlan[]
  request: DmPlan | null
}

export function welcome(input: WelcomeInput): Promise<Welcome> {
  const fallback = () => offline.welcome(input)
  const fan = input.fan
  // A normal world has groups, besties and a fan; a half-generated one gets the templates.
  if (input.groups.length === 0 || input.besties.length === 0 || !fan) return Promise.resolve(fallback())
  return withFallback('welcome', async () => {
    const first = input.user.firstName
    const everyone = [...input.groups.flatMap((group) => group.members), ...input.besties, fan]
    const people = [...new Map(everyone.map((member) => [member.id, member])).values()]
    const groupList = input.groups
      .map((group) => `- id ${group.id}: "${group.title}" (${group.vibe}). Members: ${group.members.map((m) => m.id).join(', ')}`)
      .join('\n')
    const prompt = [
      `The user:\n${userCard(input.user)}`,
      `Everyone involved:\n${cards(people, input.user)}`,
      `Group chats:\n${groupList}`,
      `Welcome DMs from: ${input.besties.map((member) => member.id).join(', ')}. Message request from: ${fan.id}.`,
    ].join('\n\n')
    const answer = await askJson<{ groups: Welcome['groups']; dms: DmPlan[]; request: DmPlan }>({
      label: 'welcome', system: SYSTEM.welcome, prompt, timeoutMs: 90_000,
      schema: object({
        groups: listOf(object({
          conversationId: { type: 'string', enum: input.groups.map((group) => group.id) },
          lines: listOf(object({ by: idOf(people), text: TEXT })),
        })),
        dms: listOf(object({ by: idOf(input.besties), messages: TEXTS })),
        request: object({ by: idOf([fan]), messages: TEXTS }),
      }),
    })
    const groups = answer.groups.map((group) => {
      const members = speakers(input.groups.find((g) => g.id === group.conversationId)?.members ?? [])
      return { conversationId: group.conversationId, lines: cleanLines(group.lines, members, first).slice(0, 4) }
    })
    if (groups.every((group) => group.lines.length === 0)) throw new UnusableAnswer('no group messages')
    return {
      groups,
      dms: cleanDms(answer.dms, speakers(input.besties), first),
      request: cleanDms([answer.request], speakers([fan]), first)[0] ?? null,
    }
  }, fallback)
}
