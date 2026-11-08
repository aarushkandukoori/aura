/**
 * Short texts about chats and messages: the inbox's second line, "typing..." labels, reply quotes
 * and the inbox search. Plain functions (no React), so they are easy to read and test.
 */
import { firstName } from '../../lib/format'
import type { Account, Conversation, ID, Message } from '../../lib/types'
import { isEmojiOnly } from './emoji'

/** Optimistic messages (shown while sending) get ids like "temp-3" until the server answers. */
export function isTemp(message: Message): boolean {
  return message.id.startsWith('temp-')
}

/** A story reply that is only an emoji is a story reaction ("Reacted 😍 to your story"). */
export function isStoryReaction(message: Message): boolean {
  return message.story !== null && isEmojiOnly(message.text)
}

/** "Replied to your story" / "You reacted 🔥 to their story": the label above a story reply. */
export function storyReplyLabel(message: Message): string {
  const mine = message.sender.kind === 'me'
  const whose = mine ? 'their' : 'your'
  const action = isStoryReaction(message) ? `reacted ${message.text.trim()} to ${whose} story` : `replied to ${whose} story`
  return sentence(mine ? 'You' : '', action)
}

/**
 * One line about a message from the reader's point of view: "You: hey", "Maya sent a photo",
 * "Replied to your story". `who` is the sender's name to show ('' for the other person in a DM).
 */
export function describeMessage(message: Message, who: string): string {
  // Story replies only ever happen in DMs, so their label never needs a name.
  if (message.story) return storyReplyLabel(message)
  if (message.text) return who ? `${who}: ${message.text}` : message.text
  if (message.media) return sentence(who, message.media.type === 'video' ? 'sent a video' : 'sent a photo')
  if (message.sharedPost) return sentence(who, message.sharedPost.kind === 'reel' ? 'sent a reel' : 'sent a post')
  return sentence(who, 'sent a message')
}

/** "Maya" + "sent a photo" -> "Maya sent a photo"; no name -> "Sent a photo". */
function sentence(who: string, action: string): string {
  return who ? `${who} ${action}` : action.charAt(0).toUpperCase() + action.slice(1)
}

/** The inbox's second line: the last message, "Seen" once they read mine, or "4 new messages". */
export function inboxPreview(conversation: Conversation): string {
  const message = conversation.lastMessage
  if (!message) return conversation.kind === 'group' ? `${conversation.members.length + 1} members` : 'Say hi 👋'
  if (conversation.unread > 1) return `${conversation.unread > 9 ? '9+' : conversation.unread} new messages`

  const mine = message.sender.kind === 'me'
  if (mine && conversation.kind === 'dm' && conversation.seenAt !== null && conversation.seenAt >= message.createdAt) return 'Seen'
  const who = mine ? 'You' : conversation.kind === 'group' ? firstName(message.sender.displayName) : ''
  return describeMessage(message, who)
}

/** "typing..." in a DM; "Maya is typing..." / "Maya and Jules are typing..." in a group. */
export function typingLabel(conversation: Conversation, typerIds: ID[]): string {
  if (conversation.kind === 'dm') return 'typing...'
  const names = typingMembers(conversation, typerIds).map((member) => firstName(member.displayName))
  if (names.length === 0) return 'typing...'
  if (names.length === 1) return `${names[0]} is typing...`
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`
  return `${names.length} people are typing...`
}

/** The members behind a list of typing ids (ids of people no longer in the chat are skipped). */
export function typingMembers(conversation: Conversation, typerIds: ID[]): Account[] {
  return typerIds.flatMap((id) => conversation.members.find((member) => member.id === id) ?? [])
}

/** The small label above a reply: "You replied to Maya", "Replied to you", "Maya replied to Jules". */
export function replyLabel(message: Message, isGroup: boolean): string {
  const quoted = message.replyTo
  if (!quoted) return ''
  const quotedMe = quoted.senderName === 'You' // the server names my own messages "You"
  if (message.sender.kind === 'me') return quotedMe ? 'You replied to yourself' : `You replied to ${firstName(quoted.senderName)}`
  const target = quotedMe ? 'you' : quoted.senderName === message.sender.displayName ? 'themself' : firstName(quoted.senderName)
  return sentence(isGroup ? firstName(message.sender.displayName) : '', `replied to ${target}`)
}

/** What a reply quote or reply chip shows for the quoted message. */
export function quoteText(message: Pick<Message, 'text' | 'media' | 'sharedPost' | 'story'>): string {
  if (message.text) return message.text
  if (message.media) return 'Photo'
  if (message.sharedPost) return message.sharedPost.kind === 'reel' ? 'Reel' : 'Post'
  return 'Message'
}

/** Inbox search: the chat's name or any member's username / display name contains the query. */
export function matchesQuery(conversation: Conversation, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  if (conversation.title.toLowerCase().includes(needle)) return true
  return conversation.members.some(
    (member) => member.username.toLowerCase().includes(needle) || member.displayName.toLowerCase().includes(needle),
  )
}

/** "Maya, Diego, Priya and you": the names under a group's title. */
export function memberNames(conversation: Conversation): string {
  const names = conversation.members.map((member) => firstName(member.displayName))
  return names.length === 0 ? 'Just you' : `${names.join(', ')} and you`
}
