/**
 * Chats: characters typing and sending messages like real people, and answering the user.
 *
 * Every message shows "typing..." first, then the bubble. A small lock per chat keeps two
 * sequences from talking over each other (say, a DM about a new post and a reply to the user):
 * a job that finds its chat busy simply tries again a few seconds later.
 */
import { dmOpener, dmReply, groupReply, type Line, type OpenerReason } from '../ai/tasks.ts'
import { nudge } from '../ai/offline.ts'
import { latestFromUser } from '../ai/prompts.ts'
import { getSetting, now, q, setSetting, worldState } from '../db/index.ts'
import {
  addMemory, bumpCloseness, getCastMember, getConversation, getConversationRow, getMemories, getMessages,
  getOrCreateDm, listConversations, markSeen, memberIds, reactToMessage, sendCastMessage, setTyping,
  type CastMember, type CastMessage, type ConversationRow,
} from '../repo/index.ts'
import { chance } from '../repo/random.ts'
import { characterFor, chatHistory, DEFAULT_VIBE, findDmId, latestUserImages, userInfo, worldStamp } from './context.ts'
import { schedule } from './scheduler.ts'
import { bubbleGap, chatDelay, sleep, typingTime } from './time.ts'

const MINUTE = 60_000
const RETRY_BUSY_MS = 4_000

/** One message a character is about to send. */
interface Bubble {
  by: string
  text: string
  sharedPostId?: string | null
  /** A reply to one of the user's stories shows the story above the bubble. */
  story?: { id: string } | null
}

/** Per world: the chats that have a sequence playing right now. */
const busyChatsOf = worldState(() => new Set<string>())

/** Run `work` while holding a chat's lock. Returns false, without running it, if the chat is busy. */
async function withChatLock(conversationId: string, work: () => Promise<void>): Promise<boolean> {
  const busyChats = busyChatsOf()
  if (busyChats.has(conversationId)) return false
  busyChats.add(conversationId)
  try {
    await work()
  } finally {
    busyChats.delete(conversationId)
  }
  return true
}

/** Forget every lock of the current world (Start over). */
export function clearChatLocks(): void {
  busyChatsOf().clear()
}

/** Has this person just said exactly this here? A job replayed after a restart must not send it twice. */
function alreadySent(conversationId: string, bubble: Bubble): boolean {
  if (!bubble.text) return false
  return q('SELECT 1 FROM messages WHERE conversation_id = ? AND sender_id = ? AND text = ? AND created_at > ? LIMIT 1')
    .get(conversationId, bubble.by, bubble.text, now() - 10 * MINUTE) !== undefined
}

function sendBubble(conversationId: string, bubble: Bubble): void {
  const message: CastMessage = {
    conversationId,
    senderId: bubble.by,
    text: bubble.text,
    sharedPostId: bubble.sharedPostId ?? null,
    // A reply to the user's story shows that story above the bubble.
    storyId: bubble.story?.id ?? null,
  }
  sendCastMessage(message)
}

/** Send bubbles one at a time, typing first. Stops if the chat disappears (deleted, or Start over). */
async function playBubbles(conversationId: string, bubbles: Bubble[]): Promise<void> {
  for (let i = 0; i < bubbles.length; i++) {
    const bubble = bubbles[i]
    if (!getConversationRow(conversationId)) return
    if (alreadySent(conversationId, bubble)) continue
    setTyping(conversationId, bubble.by, true)
    const next = bubbles[i + 1]
    // In groups the next person sometimes starts typing before this one is done, like real friends.
    if (next && next.by !== bubble.by && chance(0.35)) setTyping(conversationId, next.by, true)
    await sleep(typingTime(bubble.text))
    sendBubble(conversationId, bubble)
    if (next) await sleep(next.by === bubble.by ? bubbleGap() : bubbleGap() * 2)
  }
}

// ----- jobs: characters sending messages ------------------------------------------------------

type DmPayload = {
  accountId: string
  texts: string[]
  /** Start the chat as a message request (someone the user doesn't know writing first). */
  isRequest?: boolean
  /** Only send into an empty chat (welcome messages make no sense once a conversation started). */
  firstOnly?: boolean
  sharedPostId?: string | null
  story?: { id: string } | null
}

/** Job cast_dm: a character DMs the user (typing first), starting the chat if needed. */
export async function sendDm(payload: DmPayload): Promise<void> {
  const dm = getOrCreateDm(payload.accountId, { isRequest: payload.isRequest })
  if (!dm || (payload.firstOnly && getMessages(dm.id, 1).length > 0)) return
  const bubbles = payload.texts.map((text, index) => ({
    by: payload.accountId,
    text,
    sharedPostId: index === 0 ? payload.sharedPostId : null,
    story: index === 0 ? payload.story : null,
  }))
  if (!(await withChatLock(dm.id, () => playBubbles(dm.id, bubbles)))) schedule('cast_dm', RETRY_BUSY_MS, payload)
}

type GroupLinesPayload = { conversationId: string; lines: Line[]; sharedPostId?: string | null }

/** Job group_lines: a few members talk in a group chat, one after another. */
export async function sendGroupLines(payload: GroupLinesPayload): Promise<void> {
  const bubbles = payload.lines.map((line, index) => ({ ...line, sharedPostId: index === 0 ? payload.sharedPostId : null }))
  if (!(await withChatLock(payload.conversationId, () => playBubbles(payload.conversationId, bubbles)))) {
    schedule('group_lines', RETRY_BUSY_MS, payload)
  }
}

// ----- jobs: answering the user -----------------------------------------------------------------

/** Job chat_reply: the user wrote in a chat; the other side reads it and answers. */
export async function replyInChat(payload: { conversationId: string }): Promise<void> {
  const row = getConversationRow(payload.conversationId)
  if (!row) return
  const answer = row.kind === 'dm' ? () => answerDm(row) : () => answerGroup(row)
  if (!(await withChatLock(row.id, answer))) schedule('chat_reply', RETRY_BUSY_MS, payload)
}

async function answerDm(row: ConversationRow): Promise<void> {
  const memberId = memberIds(row)[0]
  const character = memberId ? characterFor(memberId) : null
  const user = userInfo()
  const history = chatHistory(row.id)
  const latest = latestFromUser(history)
  if (!character || !user || latest.length === 0) return

  markSeen(row.id)
  const reply = await dmReply({ user, character, memories: getMemories(character.id), history, images: latestUserImages(row.id) })
  if (!getConversationRow(row.id)) return // deleted (or Start over) while the AI was writing
  if (reply.react) reactToMessage(latest[latest.length - 1].id, character.id, reply.react)
  for (const fact of reply.memories) addMemory(character.id, fact)
  await playBubbles(row.id, reply.messages.map((text) => ({ by: character.id, text })))
  bumpCloseness(character.id, 0.01)
}

async function answerGroup(row: ConversationRow): Promise<void> {
  const members = memberIds(row).flatMap((id) => characterFor(id) ?? [])
  const user = userInfo()
  const history = chatHistory(row.id)
  const latest = latestFromUser(history)
  const conversation = getConversation(row.id)
  if (members.length === 0 || !user || latest.length === 0 || !conversation) return

  const reply = await groupReply({
    user, title: conversation.title, vibe: row.vibe ?? DEFAULT_VIBE, members, history, images: latestUserImages(row.id),
  })
  if (!getConversationRow(row.id)) return
  const lastMessageId = latest[latest.length - 1].id
  for (const reaction of reply.reactions) reactToMessage(lastMessageId, reaction.by, reaction.emoji)
  // Everyone in the chat heard it.
  for (const fact of reply.memories) for (const member of members) addMemory(member.id, fact)
  await playBubbles(row.id, reply.lines)
}

// ----- characters texting first -------------------------------------------------------------------

const OPENER_GAP_MS = 6 * MINUTE

/** At most one unprompted DM every 6 minutes, and none while 3 or more DMs are unread. */
export function dmOpenerAllowed(): boolean {
  if (now() - getSetting('simLastOpenerAt', 0) < OPENER_GAP_MS) return false
  const unread = listConversations().filter((chat) => chat.kind === 'dm' && !chat.isRequest && chat.unread > 0)
  return unread.length < 3
}

/** A character texts the user on their own: the AI writes it, then it plays out with typing. */
export async function startDm(member: CastMember, reason: OpenerReason): Promise<void> {
  const user = userInfo()
  if (!user) return
  setSetting('simLastOpenerAt', now())
  const world = worldStamp()
  const dmId = findDmId(member.id)
  const history = dmId ? chatHistory(dmId, 12) : []
  const { messages } = await dmOpener({ user, character: member, memories: getMemories(member.id), history, reason })
  if (worldStamp() !== world) return // Start over happened while the AI was writing
  schedule('cast_dm', chatDelay(1, 4), { accountId: member.id, texts: messages })
}

/**
 * Per world: the message each chat was last nudged about. Kept in memory: losing it on a restart
 * costs at most one extra nudge, and nothing is left behind in the database when a chat is deleted.
 */
const nudgedAboutOf = worldState(() => new Map<string, string>())

/**
 * Job read_nudge: the user read a close friend's message but didn't answer. A few minutes later
 * the friend sometimes sends a playful nudge ("left me on read 💀"), once per message.
 */
export async function nudgeIfIgnored(payload: { conversationId: string }): Promise<void> {
  const row = getConversationRow(payload.conversationId)
  if (!row || row.kind !== 'dm' || row.unread > 0) return
  const member = getCastMember(memberIds(row)[0] ?? '')
  const last = getMessages(row.id, 1)[0]
  if (!member || (member.role !== 'bestie' && member.role !== 'friend') || !last) return
  const alreadyNudged = nudgedAboutOf().get(row.id) === last.id
  if (last.sender.id !== member.id || alreadyNudged || now() - last.createdAt < 2 * MINUTE || !chance(0.3)) return

  const text = nudge(member, chatHistory(row.id, 10))
  if (!text) return
  await withChatLock(row.id, () => playBubbles(row.id, [{ by: member.id, text }]))
  const sent = getMessages(row.id, 1)[0]
  if (sent) nudgedAboutOf().set(row.id, sent.id)
}
