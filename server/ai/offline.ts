/**
 * Offline versions of every AI task in tasks.ts, used when no model is available, the daily cap
 * is reached, or a call fails. Characters still sound like themselves: lines come from the banks
 * in server/sim/lines.ts, filled with words from the caption or chat, styled by each character's
 * voice rules (server/sim/voice.ts), and never repeated within one post or one chat.
 */
import type { CastMember } from '../repo/index.ts'
import { chance, pick, randomBetween, randomInt, sample, shuffle } from '../repo/random.ts'
import * as lines from '../sim/lines.ts'
import { freshLine, inVoice, intentOf, sameLineKey, topicOf, voiceOf, type Intent, type Slots, type StyleOptions } from '../sim/voice.ts'
import { latestFromUser, type ChatLine } from './prompts.ts'
import type {
  CastPostCommentsInput, CommentReplyInput, DmOpenerInput, DmPlan, DmReply, DmReplyInput, EmojiReaction, GroupChatterInput,
  GroupReply, GroupReplyInput, Line, PlannedComment, PostReaction, PostReactionInput, StoryReactions, StoryReactionsInput,
  Welcome, WelcomeInput,
} from './tasks.ts'

const firstName = (member: CastMember) => member.displayName.split(' ')[0]
const isClose = (member: CastMember) => member.role === 'bestie' || member.role === 'friend'

/** One fresh line from a bank, in this character's voice (null when the bank is used up). */
function say(member: CastMember, bank: readonly string[], used: Set<string>, slots: Slots = {}, style?: StyleOptions): string | null {
  const line = freshLine(bank, used, slots)
  return line ? inVoice(line, member, style) : null
}

const present = <T>(items: (T | null | undefined)[]): T[] => items.filter((item): item is T => item != null)

/** Lines already said in a chat, so templates don't repeat them. */
const saidIn = (history: ChatLine[]) => new Set(history.map((line) => sameLineKey(line.text)))

/** Interests are written about the person ("her cat Tripod"); in their own mouth it's "cat Tripod". */
function interestOf(member: CastMember): string | null {
  const interest = member.persona.interests.length > 0 ? pick(member.persona.interests) : null
  return interest ? interest.replace(/^(her|his|their|my)\s+/i, '') : null
}

/** Three careful messages that point to 988. Every character says the same thing in their own case style. */
function crisisMessages(member: CastMember): string[] {
  return lines.CRISIS_REPLIES.map((line) => inVoice(line, member, { gentle: true }))
}

/**
 * What the user's newest chat messages are about. A bare photo or shared post counts as "photo",
 * and so does one with a few plain words ("look at this terrace"): the picture is the point.
 */
function intentOfLatest(history: ChatLine[]): Intent {
  const latest = latestFromUser(history)
  const text = latest.map((line) => line.text).join(' ').trim()
  if (!text && latest.some((line) => line.note)) return 'photo'
  const intent = intentOf(text)
  return intent === 'other' && latest.some((line) => line.picture) ? 'photo' : intent
}

const REACTIONS: Partial<Record<Intent, string>> = { laugh: '😂', goodNews: '❤️', love: '🥹', thanks: '🫶' }

/** Sad news gets their usual capitalization but no jokes, emoji or sign-off flourishes. */
const gentleFor = (intent: Intent): StyleOptions | undefined => (intent === 'sad' ? { gentle: true } : undefined)

// ----- the user's post --------------------------------------------------------------------------

export function reactToMyPost(input: PostReactionInput): PostReaction {
  const used = new Set<string>()
  const slots: Slots = { name: input.user.firstName, thing: topicOf(input.caption), place: input.location }
  const struggling = intentOf(input.caption) === 'crisis'
  const byId = new Map(input.audience.map((member) => [member.id, member]))

  // Besties comment first, the creator (if listed) last.
  const besties = shuffle(input.audience.filter((member) => member.role === 'bestie'))
  const others = shuffle(input.audience.filter((member) => member.role !== 'bestie' && member.role !== 'creator'))
  const creators = input.audience.filter((member) => member.role === 'creator')
  const replyCount = struggling ? 0 : Math.floor(input.castComments / 3)
  const comments: PlannedComment[] = []
  for (const member of [...besties, ...others, ...creators].slice(0, input.castComments - replyCount)) {
    const bank = struggling ? lines.SUPPORT_COMMENTS : lines.POST_COMMENTS[voiceOf(member).tone]
    const text = say(member, bank, used, slots)
    if (text) comments.push({ by: member.id, text, replyTo: -1 })
  }
  // Friends riffing on each other's comments.
  for (let i = 0; i < replyCount && comments.length > 0; i++) {
    const replyTo = randomInt(0, comments.length - 1)
    const parent = byId.get(comments[replyTo].by)
    const repliers = input.audience.filter((member) => member.id !== parent?.id && member.role !== 'creator')
    if (!parent || repliers.length === 0) continue
    const replier = pick(repliers)
    const text = say(replier, lines.CAST_REPLIES, used, { them: parent.username })
    if (text) comments.push({ by: replier.id, text, replyTo })
  }

  const crowdComments = present(Array.from({ length: input.crowdComments }, () => freshLine(lines.CROWD_COMMENTS, used, slots)))

  const dmFriends = shuffle(input.audience.filter(isClose)).slice(0, randomInt(1, 2))
  const dms: DmPlan[] = dmFriends.map((member) => ({
    by: member.id,
    messages: struggling
      ? crisisMessages(member)
      : present([say(member, lines.POST_DM_OPENERS, used, slots), chance(0.7) ? say(member, lines.POST_DM_FOLLOWUPS, used, slots) : null]),
  }))

  const groupLines: Line[] = struggling ? [] : present(besties.slice(0, randomInt(2, 3)).map((member) => {
    const text = say(member, lines.GROUP_POST_LINES, used, slots)
    return text ? { by: member.id, text } : null
  }))

  return { description: '', hype: randomBetween(0.9, 1.15), fact: '', comments, crowdComments, dms, groupLines }
}

// ----- comments -----------------------------------------------------------------------------------

export function replyToComment(input: CommentReplyInput): { text: string } {
  const intent = intentOf(input.replyingTo.text)
  if (intent === 'crisis') return { text: inVoice(lines.CRISIS_REPLIES[1], input.replier, { gentle: true }) }
  const used = new Set(input.thread.map((comment) => sameLineKey(comment.text)))
  const bank = intent === 'question' ? lines.QUESTION_REPLIES
    : intent === 'laugh' || intent === 'love' || intent === 'thanks' ? lines.CHAT_REPLIES[intent]
    : lines.AUTHOR_REPLIES
  return { text: say(input.replier, bank, used) ?? say(input.replier, lines.AUTHOR_REPLIES, new Set()) ?? '🙌' }
}

export function castPostComments(input: CastPostCommentsInput): { comments: PlannedComment[] } {
  const used = new Set<string>()
  const slots: Slots = { name: firstName(input.author), thing: topicOf(input.caption), place: input.location }
  const comments: PlannedComment[] = []
  for (const member of shuffle(input.commenters).slice(0, input.count)) {
    const text = say(member, lines.POST_COMMENTS[voiceOf(member).tone], used, slots)
    if (text) comments.push({ by: member.id, text, replyTo: -1 })
  }
  // Sometimes the author answers one of them.
  if (comments.length > 0 && chance(0.6)) {
    const text = say(input.author, lines.AUTHOR_REPLIES, used)
    if (text) comments.push({ by: input.author.id, text, replyTo: randomInt(0, comments.length - 1) })
  }
  return { comments }
}

// ----- chats --------------------------------------------------------------------------------------

export function dmReply(input: DmReplyInput): DmReply {
  const member = input.character
  const intent = intentOfLatest(input.history)
  if (intent === 'crisis') return { messages: crisisMessages(member), react: '', memories: [] }
  const used = saidIn(input.history)
  const slots: Slots = { name: input.user.firstName }
  const style = gentleFor(intent)
  const messages = present([say(member, lines.CHAT_REPLIES[intent] ?? lines.CHAT_REPLIES.other, used, slots, style)])
  const keepsGoing = intent === 'greeting' || intent === 'howAreYou' || intent === 'goodNews' || intent === 'other' || intent === 'photo'
  if (intent === 'sad') {
    // Sad news deserves more than one line.
    const more = say(member, lines.CHAT_REPLIES.sad, used, slots, style)
    if (more) messages.push(more)
  } else if (messages.length === 0 || (keepsGoing && chance(0.5))) {
    const followUp = say(member, lines.FOLLOW_UPS, used, slots, { closesDm: true })
    if (followUp) messages.push(followUp)
  }
  return { messages: messages.length > 0 ? messages : ['🫶'], react: chance(0.6) ? REACTIONS[intent] ?? '' : '', memories: [] }
}

export function groupReply(input: GroupReplyInput): GroupReply {
  const intent = intentOfLatest(input.history)
  const used = saidIn(input.history)
  const [first, second] = shuffle(input.members)
  if (!first) return { lines: [], reactions: [], memories: [] }
  if (intent === 'crisis') {
    return { lines: crisisMessages(first).map((text) => ({ by: first.id, text })), reactions: [], memories: [] }
  }
  const slots: Slots = { name: input.user.firstName }
  const replies = present([say(first, lines.CHAT_REPLIES[intent] ?? lines.CHAT_REPLIES.other, used, slots, gentleFor(intent))])
    .map((text): Line => ({ by: first.id, text }))
  // A second friend piles on now and then, like a real group chat (but not on sad news).
  if (second && intent !== 'sad' && chance(0.55)) {
    const text = say(second, lines.GROUP_PILE_ONS, used, { ...slots, them: firstName(first) })
    if (text) replies.push({ by: second.id, text })
  }
  const reactions: EmojiReaction[] = REACTIONS[intent] && chance(0.5) ? [{ by: (second ?? first).id, emoji: REACTIONS[intent] as string }] : []
  return { lines: replies, reactions, memories: [] }
}

export function groupChatter(input: GroupChatterInput): { lines: Line[] } {
  const used = saidIn(input.history)
  const [starter, ...others] = shuffle(input.members)
  if (!starter) return { lines: [] }
  const chat: Line[] = []
  const add = (member: CastMember, bank: readonly string[], slots: Slots = {}) => {
    const text = say(member, bank, used, slots)
    if (text) chat.push({ by: member.id, text })
  }
  add(starter, lines.CHATTER_STARTERS, { interest: interestOf(starter) })
  for (const member of others.slice(0, randomInt(1, 2))) add(member, lines.CHATTER_REPLIES)
  if (input.askUser) add(pick(input.members), lines.CHATTER_PULL_INS, { name: input.user.firstName })
  return { lines: chat }
}

export function dmOpener(input: DmOpenerInput): { messages: string[] } {
  const member = input.character
  const used = saidIn(input.history)
  const slots: Slots = { name: input.user.firstName, interest: interestOf(member), thing: topicOf(input.user.recentPosts[0] ?? '') }
  // Nobody brings up "your last post" when the user hasn't posted anything yet.
  const bank = input.reason ? lines.REASON_OPENERS[input.reason]
    : lines.DM_OPENERS.filter((line) => input.user.recentPosts.length > 0 || !/\bpost\b/.test(line))
  const messages = present([
    say(member, bank, used, slots, { opensDm: true }),
    chance(0.4) ? say(member, lines.FOLLOW_UPS, used, slots, { closesDm: true }) : null,
  ])
  return { messages: messages.length > 0 ? messages : [inVoice('hiii', member, { opensDm: true })] }
}

/** A close friend nudging after being left on read (offline only: it is always short). */
export function nudge(member: CastMember, history: ChatLine[]): string | null {
  return say(member, lines.NUDGES, saidIn(history))
}

// ----- stories and the welcome burst --------------------------------------------------------------

export function storyReactions(input: StoryReactionsInput): StoryReactions {
  const used = new Set<string>()
  const reactions = sample(input.viewers, randomInt(2, 5)).map((member) => ({ by: member.id, emoji: pick(lines.STORY_EMOJIS) }))
  const slots: Slots = { thing: topicOf(input.overlayText ?? '') }
  const replies = shuffle(input.viewers.filter(isClose)).slice(0, randomInt(1, 2)).map((member) => ({
    by: member.id,
    messages: present([say(member, lines.STORY_REPLIES, used, slots)]),
  }))
  return { reactions, replies: replies.filter((reply) => reply.messages.length > 0) }
}

export function welcome(input: WelcomeInput): Welcome {
  const slots: Slots = { name: input.user.firstName }
  // One set for every group: the same friend is in several groups and the user reads them all.
  const used = new Set<string>()
  const groups = input.groups.map((group) => {
    const speakers = shuffle(group.members).slice(0, randomInt(2, 3))
    return {
      conversationId: group.id,
      lines: present(speakers.map((member) => {
        const text = say(member, lines.WELCOME_GROUP, used, slots)
        return text ? { by: member.id, text } : null
      })),
    }
  })
  const dmUsed = new Set<string>()
  const dms = input.besties.map((member) => ({
    by: member.id,
    messages: present([
      say(member, lines.WELCOME_DM, dmUsed, slots, { opensDm: true }),
      chance(0.5) ? say(member, lines.WELCOME_DM, dmUsed, slots) : null,
    ]),
  }))
  const fan = input.fan
  const request = fan
    ? { by: fan.id, messages: present([say(fan, lines.REQUEST_OPENERS, dmUsed, slots), say(fan, lines.REQUEST_FOLLOW_UPS, dmUsed, slots)]) }
    : null
  return { groups, dms, request }
}
