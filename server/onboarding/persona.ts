/**
 * Writing a friend the user described at sign-up ("my best friend Jake, who lives in sneaker
 * stores") as a full character: who they are, how they look in photos, how they type, a few posts
 * with photo prompts, and the first DM they send when they join. One AI call, or simple templates
 * when AI is off. Everything is checked and tidied before it becomes an account (new-friends.ts).
 */
import type { Role } from '../../shared/types.ts'
import { askJson } from '../ai/llm.ts'
import { userCard, type UserInfo } from '../ai/prompts.ts'
import { pick } from '../repo/random.ts'
import { clip } from './clean.ts'
import { NEW_FRIEND_SYSTEM } from './prompts.ts'
import { firstNameOf } from './roster.ts'

export interface DescribedFriend {
  name: string
  description: string
  role: Role
}

export interface NewFriendPersona {
  username: string
  displayName: string
  age: number
  pronouns: string
  location: string
  occupation: string
  concept: string
  bio: string
  /** How they look in every photo. Empty means no pictures: they keep the placeholder. */
  look: string
  voice: string
  traits: string[]
  interests: string[]
  relationship: string
  /** Photo prompts with their look already filled in. */
  avatarPrompt: string
  posts: { imagePrompt: string; caption: string; location: string | null }[]
  firstMessages: string[]
}

/** Who they are to the user, in a few words for the prompt. */
const ROLE_WORDS: Partial<Record<Role, string>> = {
  bestie: 'one of their closest people', friend: 'a friend', mutual: 'someone they know a little',
}

/** takenNames: everyone already in the user's world, so the new friend gets a last name of their own. */
export async function writeNewFriend(
  friend: DescribedFriend, user: UserInfo | null, takenNames: string[],
): Promise<NewFriendPersona> {
  const first = firstNameOf(friend.name)
  const prompt = [
    `The user:\n${user ? userCard(user) : 'A new Aura user.'}`,
    `The person they described: ${friend.name}, ${ROLE_WORDS[friend.role] ?? 'a friend'}.`
      + `\nWhat the user said about them: ${friend.description}`,
    `Already in their world (give ${first} a last name none of them has): ${takenNames.join(', ')}.`,
    `Return:
- username: a realistic, unique Instagram handle (lowercase letters, numbers, dots, underscores; no @).
- displayName: ${first} plus a last name.
- age (19-45), pronouns, location (a city), occupation.
- concept: one specific sentence about who they are (their own life, not the user).
- bio: an Instagram bio in their style, max 120 characters.
- look: 25-40 words describing exactly how they look in photos (age, ethnicity, face, hair, build, signature style) so every picture shows the same person.
- voice: one sentence on exactly how they type (case, punctuation, slang, emoji habits).
- traits: 3-5 personality traits. interests: 3-5 short interests.
- relationship: one sentence on how they know and feel about the user, written as "the user", true to what the user said.
- avatarPrompt: their profile picture, starting with the word PERSON (we put their look there).
- posts: 3-4 posts from their grid, newest first, matching their life. imagePrompt: one concrete smartphone photo; start with PERSON when they are in it (about half of them), otherwise a point-of-view shot (food, places, objects, friends' hands). caption: in their voice. location: a place name or "".
- firstMessages: 1-2 short texts they send the user the moment they join Aura, in their voice, with something only they would say to the user.`,
  ].join('\n\n')
  try {
    const answer = await askJson<Record<string, unknown>>({
      label: 'new-friend',
      system: NEW_FRIEND_SYSTEM,
      prompt,
      schema: PERSONA_SCHEMA,
      effort: 'medium',
      timeoutMs: 120_000,
    })
    return tidyPersona(answer, friend)
  } catch {
    return templatePersona(friend)
  }
}

const TEXT = { type: 'string' }
const TEXTS = { type: 'array', items: TEXT }
const PERSONA_SCHEMA = {
  type: 'object',
  properties: {
    username: TEXT, displayName: TEXT, age: { type: 'integer' }, pronouns: TEXT, location: TEXT, occupation: TEXT,
    concept: TEXT, bio: TEXT, look: TEXT, voice: TEXT, traits: TEXTS, interests: TEXTS, relationship: TEXT, avatarPrompt: TEXT,
    posts: { type: 'array', items: { type: 'object', properties: { imagePrompt: TEXT, caption: TEXT, location: TEXT } } },
    firstMessages: TEXTS,
  },
}

const texts = (value: unknown, max: number, length: number) =>
  (Array.isArray(value) ? value : []).map((item) => clip(item, length)).filter(Boolean).slice(0, max)

/** "PERSON laughing at a taco truck" -> "<their look> laughing at a taco truck". */
function withLook(prompt: string, look: string): string {
  if (!look) return prompt
  return prompt.includes('PERSON') ? prompt.replaceAll('PERSON', look) : prompt
}

function tidyPersona(raw: Record<string, unknown>, friend: DescribedFriend): NewFriendPersona {
  const look = clip(raw.look, 400).replace(/\.$/, '')
  const displayName = clip(raw.displayName, 40)
  const avatarPrompt = clip(raw.avatarPrompt, 600)
  const posts = (Array.isArray(raw.posts) ? raw.posts : []).slice(0, 4).flatMap((post: Record<string, unknown>) => {
    const imagePrompt = clip(post?.imagePrompt, 600)
    if (!imagePrompt) return []
    return [{ imagePrompt: withLook(imagePrompt, look), caption: clip(post.caption, 300), location: clip(post.location, 60) || null }]
  })
  const firstMessages = texts(raw.firstMessages, 2, 300)
  const fallback = templatePersona(friend)
  const sameFirstName = displayName.toLowerCase().startsWith(firstNameOf(friend.name).toLowerCase())
  return {
    username: clip(raw.username, 30) || fallback.username,
    displayName: sameFirstName ? displayName : friend.name, // they keep the name the user gave them
    age: Math.min(60, Math.max(19, Number(raw.age) || 25)),
    pronouns: clip(raw.pronouns, 30),
    location: clip(raw.location, 60),
    occupation: clip(raw.occupation, 60),
    concept: clip(raw.concept, 300) || fallback.concept,
    bio: clip(raw.bio, 150),
    look,
    voice: clip(raw.voice, 300) || fallback.voice,
    traits: texts(raw.traits, 5, 80),
    interests: texts(raw.interests, 5, 40),
    relationship: clip(raw.relationship, 300) || fallback.relationship,
    // Without "PERSON" the face would be a stranger's, so their look goes first.
    avatarPrompt: avatarPrompt.includes('PERSON')
      ? withLook(avatarPrompt, look)
      : `${look}, ${avatarPrompt || 'smiling, close-up selfie'}`,
    posts,
    firstMessages: firstMessages.length > 0 ? firstMessages : fallback.firstMessages,
  }
}

/** Without AI: the user's own description, a plain friendly voice, no pictures, and a hello. */
function templatePersona(friend: DescribedFriend): NewFriendPersona {
  const first = firstNameOf(friend.name)
  // The user already follows them (they were added at sign-up), so nobody asks for a follow back.
  const hello = friend.role === 'bestie' ? ['ok i finally made one', 'you better hype every single post 😤']
    : friend.role === 'mutual' ? ['hey! saw you on here', 'following 🙂']
    : ['hiii look who finally joined', 'following you rn ✨']
  const knows = friend.role === 'bestie' ? "is one of the user's closest people"
    : friend.role === 'mutual' ? 'knows the user a little'
    : 'is a friend of the user'
  return {
    username: `${first}.${pick(['irl', 'xo', 'daily', 'ok', 'here'])}`,
    displayName: friend.name,
    age: 25,
    pronouns: '',
    location: '',
    occupation: '',
    concept: friend.description,
    bio: '✨ new here',
    look: '',
    voice: 'Casual lowercase texting with a few emojis, says "lol" a lot.',
    traits: ['warm', 'funny', 'loyal'],
    interests: [],
    relationship: `${first} ${knows}. ${friend.description}`,
    avatarPrompt: '',
    posts: [],
    firstMessages: hello,
  }
}
