/**
 * Shared prompt text: the rules every AI task follows, and the short "cards" that describe the
 * user and each character. server/ai/tasks.ts builds each prompt from these pieces.
 */
import type { CastMember } from '../repo/index.ts'

/** What the prompts know about the user. Built from the database by server/sim/context.ts. */
export interface UserInfo {
  name: string
  firstName: string
  username: string
  pronouns: string
  bio: string
  interests: string[]
  /** How they know most of their friends: "college", "work", "online"... */
  origin: string
  tierLabel: string
  followers: number
  /** Facts everyone in their world knows ("just adopted a kitten"). */
  memories: string[]
  /** Short descriptions of their latest posts, newest first. */
  recentPosts: string[]
}

/** One chat message, ready to quote in a prompt. */
export interface ChatLine {
  id: string
  /** 'me' for the user, otherwise the sender's account id. */
  senderId: string
  /** First name, as friends would see it. */
  name: string
  text: string
  /** What else the message carries: "[sent a photo]", "[shared a post ...]". */
  note: string | null
  /** The message carries a photo, a video or a shared post (the offline replies react to the picture). */
  picture?: boolean
}

/**
 * The rules for every task. They go first in every system prompt and never change, so the
 * provider can cache them.
 */
const WORLD_RULES = `You write for Aura, a photo-sharing social app. One real person uses it. Every other account is a character you play: their close friends, people who know them a little, fans, and a few well-known creators. Write exactly what those people would type.

Voice
- Follow each character's typing style literally, in every message, even when they're excited: capitalization, punctuation, emoji habits, slang, sign-offs, language mixing. If their style says all lowercase or no punctuation, there are no capitals or punctuation at all. Two characters must never sound alike.
- Besties and friends know the user's life, tease them and bring up shared history. Mutuals are friendly but less familiar. Fans have never met them and are a little starstruck. Creators are busy, brief and cool.

Content
- Be specific. Mention what is actually in the photo or message: objects, colors, the place, the outfit, the food, the light, the joke in the caption. A line that could go under any post is a failure.
- Vary length and type: some one- or two-word reactions, some questions, some teasing or inside jokes, a few longer ones.
- Everyone likes the user, but it must read like real people, not a fan club: no generic flattery ("You look amazing!", "So inspiring!", "Love this!"), no customer-service tone, no hashtags, no walls of exclamation points unless that is the character's style.
- Never mention AI, prompts, characters or "the user" (use their first name, or nothing). Never break character.
- PG-13 and kind. Nothing sexual, no slurs, nothing cruel.

Safety
- If the user says anything that suggests self-harm, suicide or being in crisis, the character drops the jokes and answers with real care in their own voice, encourages them to reach out to someone they trust, and mentions they can call or text 988 (the Suicide & Crisis Lifeline in the US) any time.`

const withRules = (task: string) => `${WORLD_RULES}\n\n${task}`

/**
 * The system prompt of each AI task in tasks.ts: the shared rules, then what this task is for.
 * They never change between calls, so the provider can cache them.
 */
export const SYSTEM = {
  reactToMyPost: withRules(`Task: the user just posted. Look closely at the photo(s) and read the caption, then write how the people in their life react.
- description: one or two plain sentences on what the photo actually shows (people, clothes, objects, place, light, mood). It is saved for later conversations.
- hype: 0.8 to 1.3, how well this post will do. Striking, funny or personal photos score higher; plain or blurry ones lower.
- fact: one short fact about the user's life that this post reveals ("just adopted a kitten", "is visiting Lisbon"), or "".
- comments: the requested number, from the listed characters, in the order they are posted. Nobody comments twice unless it is a reply. replyTo is the 0-based index of an earlier comment in this list that the comment answers, or -1. About a third should be replies: friends riffing on each other, answering a question someone asked, piling onto a joke. Most comments are short (2-12 words); a few are longer.
- crowdComments: the requested number, from strangers who follow the user. They don't know the user, so they are short, but still about this photo. At most one emoji-only.
- dms: 1-3 besties or friends who also message the user privately about the post, 1-3 short bubbles each: more personal than a comment (a question, a tease, "wait where is this").
- groupLines: 2-4 messages in the besties' group chat, where they talk about the post among themselves and tease or tag the user.`),

  replyToComment: withRules(`Task: a character answers a comment under a post. Write their one reply: short (usually under 15 words), in their voice, answering that comment specifically: a joke back, a thank-you with personality, a real answer to a question. Don't start with an @mention; the app adds it.`),

  dmReply: withRules(`Task: you are texting as one character in a private DM with the user. Write the character's next message(s).
- Usually 1-2 short bubbles, like real texting (3 only when there is a lot to say). Separate thoughts go in separate bubbles. A short message from the user gets a short answer.
- Answer what the user actually said. Keep continuity with the whole conversation and with what you remember about them. Bring up your own life (job, interests, people) when it fits, ask a follow-up sometimes, but don't end every reply with a question.
- Match their energy: a quick "lol" gets a quick reply, big news gets a big reaction, something heavy gets warmth.
- react: one emoji reaction to the user's last message when it fits (a joke, good news, something sweet), otherwise "".
- memories: lasting facts about the user from their newest messages (plans, people, pets, work, tastes), each a short phrase like "has a job interview on Friday". [] if none. Skip anything already remembered.`),

  groupReply: withRules(`Task: a group chat between the user and some of their friends. The user just wrote something. Write what happens next.
- 1-4 messages from 1-3 members, in order (not everyone answers every time). Each message is one short bubble in that member's style.
- Answer the user, react to each other, talk over each other, keep the chat's running jokes going. It should feel like friends, not a panel answering questions.
- reactions: 0-2 emoji reactions to the user's last message, from members who would tap one.
- memories: lasting facts about the user from their newest messages, each a short phrase, or [].`),

  groupChatter: withRules(`Task: a group chat that includes the user has been quiet for a while. Write a short burst of 3-6 messages where two or three members talk among themselves like real friends: something from their own lives (work, interests, a story from today), a plan, a hot take, a recommendation, a question for the group. One short bubble per message, in each member's style.
- Don't repeat topics from the recent messages.
- When asked to pull the user in, the last message asks them something or mentions them by first name.`),

  dmOpener: withRules(`Task: one character starts a DM with the user out of the blue. Write 1-3 short bubbles.
- Make it specific: something from their own day (job, interests), a callback to something they remember about the user, a reaction to one of the user's recent posts, a recommendation, or a question only a friend would ask. Never a generic "hey how are you".
- If a reason is given, the message is about that.
- Don't repeat anything from the recent messages.`),

  castPostComments: withRules(`Task: one character just posted, and the user is not part of this. Write the comments from the other listed characters (the author's friends and followers): specific to the photo and caption, in their own voices.
- replyTo is the 0-based index of an earlier comment this one answers, or -1. About a third should be replies, and the author may answer a comment or two (using the author's id).`),

  storyReactions: withRules(`Task: the user posted a story (a photo that disappears after 24 hours). Look at it.
- reactions: quick emoji reactions from 2-5 of the listed characters, one emoji each, fitting the story.
- replies: 1-2 besties or friends who reply to the story by DM, 1-2 short bubbles each, specific to what's in it (people reply to stories with questions, teasing, "wait where is this").`),

  welcome: withRules(`Task: the user just joined Aura, and the people in their life are excited to see them on it.
- groups: for each group chat, 2-4 messages from its members welcoming the user in their own voices, like they've been waiting for this: teasing, hyping, starting the chat's usual energy. Members only speak in their own group.
- dms: one welcome DM from each listed bestie, 1-2 bubbles, personal (shared history, an inside joke).
- request: the listed fan sends a first message request, 1-2 bubbles. They have never met the user: polite, a little starstruck, specific about how they found them (see their card).`),
}

/** 1,234 · 12.4K · 1.2M */
export function formatCount(count: number): string {
  if (count >= 1_000_000) return `${trimZero(count / 1_000_000)}M`
  if (count >= 10_000) return `${trimZero(count / 1_000)}K`
  return count.toLocaleString('en-US')
}

function trimZero(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '')
}

/** Persona texts were written about "the user"; cards use the real first name instead. */
function personal(text: string, firstName: string): string {
  return text.replace(/\bthe user's\b/gi, `${firstName}'s`).replace(/\bthe user\b/gi, firstName)
}

const ROLE_LABELS: Record<CastMember['role'], string> = {
  bestie: 'bestie (inner circle)',
  friend: 'friend',
  mutual: 'mutual (knows them a little)',
  fan: 'fan (has never met them)',
  creator: 'creator',
}

/**
 * A character in a few lines, e.g.
 *   [maya] @mayaokonkwo_ · Maya Okonkwo, 27, she/her · bestie (inner circle) · ER nurse, Brooklyn
 *     Who: ... Types: ... Traits: ... Into: ... With Sam: ...
 * The id in brackets is what the JSON answers use to say who wrote what.
 */
export function personaCard(member: CastMember, userFirstName: string): string {
  const persona = member.persona
  const role = member.role === 'creator'
    ? `creator (verified, ${formatCount(member.followers)} followers)`
    : ROLE_LABELS[member.role]
  const where = [member.occupation, member.location].filter(Boolean).join(', ')
  const header = [
    `[${member.id}] @${member.username}`,
    [member.displayName, persona.age, member.pronouns].filter(Boolean).join(', '),
    role,
    where,
  ].filter(Boolean).join(' · ')
  const lines = [
    header,
    persona.concept && `  Who: ${personal(persona.concept, userFirstName)}`,
    persona.voice && `  Types: ${persona.voice}`,
    persona.traits.length > 0 && `  Traits: ${persona.traits.join(', ')}`,
    persona.interests.length > 0 && `  Into: ${persona.interests.join(', ')}`,
    persona.relationship && `  With ${userFirstName}: ${personal(persona.relationship, userFirstName)}`,
  ]
  return lines.filter(Boolean).join('\n')
}

const ORIGINS: Record<string, string> = {
  college: 'from college',
  'high school': 'from high school',
  work: 'from work',
  online: 'online',
  hometown: 'from their hometown',
}

/** The user in a few lines: who they are, how popular, and what their world knows about them. */
export function userCard(user: UserInfo): string {
  const lines = [
    `${user.name} (@${user.username})${user.pronouns ? `, ${user.pronouns}` : ''}.`,
    `${user.tierLabel} account, ${formatCount(user.followers)} followers.`,
    user.bio && `Bio: "${user.bio}"`,
    user.interests.length > 0 && `Into: ${user.interests.join(', ')}`,
    `Knows most of their friends ${ORIGINS[user.origin] ?? `from ${user.origin}`}.`,
    user.memories.length > 0 && `What people know about ${user.firstName}: ${user.memories.join('; ')}.`,
    user.recentPosts.length > 0 && `${user.firstName}'s recent posts: ${user.recentPosts.join(' / ')}`,
  ]
  return lines.filter(Boolean).join('\n')
}

/** A chat transcript, oldest first: "Maya: wait where is this". */
export function formatChat(lines: ChatLine[]): string {
  if (lines.length === 0) return '(no messages yet)'
  return lines.map((line) => `${line.name}: ${[line.note, line.text].filter(Boolean).join(' ')}`).join('\n')
}

/** The user's messages since anyone else last spoke: what a reply has to answer. */
export function latestFromUser(history: ChatLine[]): ChatLine[] {
  const lastOther = history.findLastIndex((line) => line.senderId !== 'me')
  return history.slice(lastOther + 1)
}
