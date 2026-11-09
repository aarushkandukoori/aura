/**
 * The sign-up plan without AI (offline mode, the daily cap, or a failed call). Plain keyword
 * rules read what the user said: interests from the words they used, how popular they want to
 * be, where they know their friends from, their name and pronouns, friends they named ("my best
 * friend Jake ...") and simple facts ("I work night shifts" -> "works night shifts").
 *
 * The cast keeps its usual shape (the besties stay besties, so every relationship still reads
 * true); the friends who share their interests come first, and a small, cozy world keeps fewer.
 * cleanPlan() then checks the result like any other plan.
 */
import type { CastPersona } from '../../shared/cast.ts'
import type { Tier, WorldPlan } from '../../shared/types.ts'
import { interestEmoji, interestScore, matchesInterest } from '../repo/interests.ts'
import { firstNameOf, pickableCast } from './roster.ts'

/** The onboarding interest chips (the server's interest matching knows related words for each). */
const CHIP_INTERESTS = [
  'music', 'food', 'fitness', 'fashion', 'travel', 'art', 'photography', 'gaming', 'books', 'movies',
  'pets', 'sports', 'nature', 'tech', 'coffee', 'dance', 'comedy', 'beauty', 'cooking', 'outdoors',
]
/** Everyday words the interest matching doesn't know yet. */
const MORE_WORDS: Record<string, RegExp> = {
  gaming: /\b(games?|gamer|xbox|playstation|ps5|nintendo|valorant|minecraft|fortnite)\b/i,
  music: /\b(sing(er|ing)?|rapp(er|ing)|produc(er|ing)|dj|studio|songs?|musicians?|open mics?)\b/i,
  books: /\b(bookish|mysteries|book club)\b/i,
  movies: /\b(tv|shows|netflix)\b/i,
  pets: /\b(golden retriever|retrievers?|labradors?|huskies|husky|doodles?|poodles?|bunny|bunnies|hamsters?|parrots?)\b/i,
  food: /\b(pasta|sushi|noodles?|dumplings?|burgers?|boba|bubble tea|foodie|restaurants?)\b/i,
}
/** Interests that aren't chips but come up a lot. */
const EXTRA_INTERESTS: Record<string, RegExp> = {
  anime: /\b(anime|manga|cosplay)/i,
  'k-pop': /\bk-?pop\b/i,
  cars: /\bcars?\b/i,
  theater: /\b(theat(er|re)|musicals?)\b/i,
  writing: /\b(writing|poetry|poems?)\b/i,
}

export function offlinePlan(transcript: string, accountName: string | null, cast: CastPersona[]): Partial<WorldPlan> {
  const interests = interestsIn(transcript)
  const tier = tierIn(transcript)
  const displayName = nameIn(transcript) ?? accountName ?? ''
  const userName = nameForStories(displayName, cast)
  const named = namedFriends(transcript, firstNameOf(displayName))
  const friends = withNamedCast(pickPeople(interests, cast, tier), named, cast).map((friend) => ({
    ...friend, relationship: aboutUser(friend.relationship, userName),
  }))
  const besties = friends.filter((friend) => friend.role === 'bestie')
  const names = (ids: { id: string }[]) => ids.map(({ id }) => firstNameOf(cast.find((persona) => persona.id === id)?.displayName ?? id))
  return {
    displayName,
    username: displayName,
    bio: interests.slice(0, 3).map((interest) => `${interestEmoji(interest)} ${interest}`).join(' · '),
    pronouns: /\b(she\/her|he\/him|they\/them)\b/i.exec(transcript)?.[1].toLowerCase() ?? '',
    interests,
    origin: originIn(transcript),
    tier,
    summary: `${listOf(names(besties))} are your inner circle, and everyone knows you're into ${listOf(interests.slice(0, 3))}.`,
    friends,
    groupChats: groupsFor(friends, interests, cast),
    // Someone they named who is already a character ("my best friend Maya") is that character, not a new person.
    newFriends: named.filter((person) => !castNamed(person.name, cast)),
    memories: sentences(transcript).map(toMemory).filter((fact): fact is string => fact !== null).slice(0, 6),
  }
}

/**
 * The cast's stories say "the user"; the AI's plans use the user's first name ("Maya is Sam's gym
 * partner"), and seed/plan.ts turns the name back into "the user" when the world is built. Writing
 * the offline plan the same way keeps the review screen readable ("every single thing Sam posts").
 * No name, or a name a character also has: "the user" stays, as seed/plan.ts expects.
 */
function nameForStories(displayName: string, cast: CastPersona[]): string | null {
  const first = firstNameOf(displayName)
  if (first.length < 2 || cast.some((persona) => firstNameOf(persona.displayName) === first)) return null
  return first
}

function aboutUser(relationship: string, userName: string | null): string {
  if (!userName) return relationship
  return relationship.replace(/\bthe user's\b/gi, `${userName}'s`).replace(/\bthe user\b/gi, userName)
}

/** The pickable character with this first name ("Maya" -> maya), if any. */
function castNamed(name: string, cast: CastPersona[]): CastPersona | undefined {
  return pickableCast(cast).find((persona) => firstNameOf(persona.displayName).toLowerCase() === name.toLowerCase())
}

/** Characters they named come first among their people (the closest ones send the first welcome DMs). */
function withNamedCast(friends: WorldPlan['friends'], named: WorldPlan['newFriends'], cast: CastPersona[]): WorldPlan['friends'] {
  const first: WorldPlan['friends'] = []
  for (const person of named) {
    const persona = castNamed(person.name, cast)
    if (!persona || first.some((friend) => friend.id === persona.id)) continue
    const role = person.role === 'bestie' ? 'bestie' : (friends.find((friend) => friend.id === persona.id)?.role ?? 'friend')
    first.push({ id: persona.id, role, relationship: persona.relationship, account: null })
  }
  const rest = friends.filter((friend) => !first.some((chosen) => chosen.id === friend.id))
  const withRole = (wanted: string) => [...first, ...rest].filter((friend) => friend.role === wanted)
  return [...withRole('bestie'), ...withRole('friend')]
}

const listOf = (words: string[]) => (words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words[0] ?? '')

function interestsIn(text: string): string[] {
  const found = CHIP_INTERESTS.filter((interest) => matchesInterest(interest, text) || MORE_WORDS[interest]?.test(text))
  for (const [interest, pattern] of Object.entries(EXTRA_INTERESTS)) if (pattern.test(text)) found.push(interest)
  // Everyone gets at least three, so the feed and the interest chat have something to go on.
  for (const filler of ['music', 'food', 'travel']) if (found.length < 3 && !found.includes(filler)) found.push(filler)
  return found.slice(0, 8)
}

function tierIn(text: string): Tier {
  if (/\b(world[- ]famous|celebrity|millions|household name|super famous|really famous|so famous)\b/i.test(text)) return 'icon'
  // "Campus famous" is exactly how the Popular tier describes itself.
  if (/\b(campus|school|locally|local|town|kinda|kind of|a little)[- ]famous\b/i.test(text)) return 'popular'
  if (/\b(influencer|brand deals?|sponsors?|blow up|go viral|famous|recogni[sz]e me)\b/i.test(text)) return 'influencer'
  // "Pretty popular" says the tier outright, even next to "a cozy group chat" (but not "I don't need to be popular").
  if (/\bpopular\b/i.test(text) && !/(\bnot\b|n't\b|\bnever\b)[^.]{0,24}\bpopular\b/i.test(text)) return 'popular'
  if (/\b(small|cozy|cosy|close[- ]knit|tight[- ]knit|few|quiet|low[- ]key|private)\b/i.test(text)) return 'rising'
  return 'popular'
}

function originIn(text: string): string {
  if (/\bhigh ?school\b/i.test(text)) return 'high school'
  if (/\b(college|university|campus|dorm|freshman|sophomore)\b/i.test(text)) return 'college'
  if (/\b(work|job|coworkers?|office|hospital|shifts?)\b/i.test(text)) return 'work'
  if (/\b(online|discord|internet|twitch)\b/i.test(text)) return 'online'
  if (/\b(hometown|grew up|neighbou?rs?)\b/i.test(text)) return 'hometown'
  return 'college'
}

const NOT_NAMES = new Set(['A', 'An', 'The', 'Just', 'So', 'Really', 'Not', 'Very', 'In', 'At', 'From', 'Into', 'Pretty', 'Kind', 'Also'])

/** "my name is Nina" / "I'm Nina" -> "Nina" (names are the capitalized word, so "I'm a nurse" is no name). */
function nameIn(text: string): string | null {
  const match = /\b(?:[Mm]y name is|[Mm]y name's|I'm|I am|[Cc]all me)\s+([A-Z][a-z]+)\b/.exec(text)
  return match && !NOT_NAMES.has(match[1]) ? match[1] : null
}

const ROLE_ORDER: Record<string, number> = { bestie: 0, friend: 1, mutual: 2 }

/** The cast's besties, then the friends (and mutuals) who share the most interests. */
function pickPeople(interests: string[], cast: CastPersona[], tier: Tier): WorldPlan['friends'] {
  const pickable = pickableCast(cast)
  const score = (persona: CastPersona) => interestScore(interests, `${persona.interests.join(', ')}. ${persona.concept}`)
  const besties = pickable.filter((persona) => persona.role === 'bestie').slice(0, 4)
  const friends = pickable
    .filter((persona) => persona.role !== 'bestie')
    .map((persona) => ({ persona, score: score(persona) }))
    .sort((a, b) => b.score - a.score || ROLE_ORDER[a.persona.role] - ROLE_ORDER[b.persona.role])
    .slice(0, tier === 'rising' ? 3 : 8)
  return [
    ...besties.map((persona) => ({ id: persona.id, role: 'bestie' as const, relationship: persona.relationship, account: null })),
    ...friends.map(({ persona }) => ({ id: persona.id, role: 'friend' as const, relationship: persona.relationship, account: null })),
  ]
}

/** The besties' chat, a chat about their top interest with the people who share it, and a friends' chat. */
function groupsFor(friends: WorldPlan['friends'], interests: string[], cast: CastPersona[]): WorldPlan['groupChats'] {
  const ids = (role: string) => friends.filter((friend) => friend.role === role).map((friend) => friend.id)
  const groups: WorldPlan['groupChats'] = [
    { title: 'the besties', emoji: '💌', vibe: 'inner circle, chaotic, supportive', memberIds: ids('bestie') },
  ]
  const top = interests[0]
  const fans = friends
    .map((friend) => cast.find((persona) => persona.id === friend.id))
    .filter((persona): persona is CastPersona => persona !== undefined && interestScore([top], persona.interests.join(', ')) > 0)
    .slice(0, 4)
    .map((persona) => persona.id)
  if (top && fans.length >= 2) {
    groups.push({ title: `${top} club`, emoji: interestEmoji(top), vibe: `everyone here loves ${top}: finds, recs and plans`, memberIds: fans })
  }
  groups.push({ title: 'weekend plans', emoji: '🍻', vibe: 'plans, memes and catching up', memberIds: ids('friend').slice(0, 4) })
  return groups
}

// ----- people and facts from their own words --------------------------------------------------

const RELATIONS = 'best friend|bestie|bff|roommate|sister|brother|cousin|boyfriend|girlfriend|partner|husband|wife|friend|coworker|bandmate|teammate'
const CLOSE = new Set(['best friend', 'bestie', 'bff', 'sister', 'brother', 'boyfriend', 'girlfriend', 'partner', 'husband', 'wife'])

/** "my best friend Jake lifts with me" -> Jake, a bestie. Only capitalized names count. */
function namedFriends(text: string, userFirstName: string): WorldPlan['newFriends'] {
  const pattern = new RegExp(`\\bmy\\s+(${RELATIONS})\\s+(?:is\\s+)?(?:named\\s+|called\\s+)?([A-Z][a-z]+)\\b`, 'gi')
  const owner = userFirstName ? `${userFirstName}'s` : "The user's"
  const people: WorldPlan['newFriends'] = []
  for (const match of text.matchAll(pattern)) {
    const [, relation, name] = match
    if (!/^[A-Z]/.test(name) || NOT_NAMES.has(name) || name === userFirstName) continue
    if (people.some((person) => person.name === name)) continue
    // "Sam's best friend Jake lifts with them every morning." says who Jake is and what they're like.
    const said = theirWords(sentences(text).find((line) => line.includes(name)) ?? '').replace(/^their\b/i, owner)
    people.push({
      name,
      description: said ? `${said.charAt(0).toUpperCase()}${said.slice(1)}.` : `${owner} ${relation.toLowerCase()}.`,
      role: CLOSE.has(relation.toLowerCase()) ? 'bestie' : 'friend',
    })
  }
  return people.slice(0, 3)
}

/** Sentences, also split at "and I" / ", my" (speech-to-text often has no punctuation). */
function sentences(text: string): string[] {
  return text
    .split(/[.!?\n]+|,\s+(?=(?:i|my)\b)|\s+(?:and|but|so)\s+(?=(?:i|my)\b)/i)
    .map((part) => part.trim())
    .filter(Boolean)
}

/** Facts, not wishes about the app or how many followers they want. */
const NOT_A_FACT = /\b(popular|famous|followers?|influencer|viral|aura|app|want|wish|name|you)\b/i
const ADVERB = /^(\w+ly|also|just|still|always|never|kinda|sorta|even|often)$/i
const SAME_FORM = /^(can|could|will|would|should|might|must|was|did|can't|won't|cannot|used|\w+ed)$/i
const IRREGULAR: Record<string, string> = { have: 'has', do: 'does', go: 'goes', "don't": "doesn't", dont: "doesn't", am: 'is' }

/** "I basically live at the gym" -> "basically lives at the gym"; "My sister is a DJ" -> "their sister is a DJ". */
export function toMemory(sentence: string): string | null {
  const text = sentence.trim().replace(/^(and|but|so|also|um+|uh+|well)[, ]+/i, '')
  if (text.length < 8 || text.length > 140 || NOT_A_FACT.test(text)) return null
  const lead = /^(i'm|im|i am|i've|ive|i have|i'll|i will|i|my)\s+(.+)$/i.exec(text)
  if (!lead) return null
  const [, opener, rest] = lead
  const start = opener.toLowerCase()
  const fact = ["i'm", 'im', 'i am'].includes(start) ? `is ${rest}`
    : ["i've", 'ive', 'i have'].includes(start) ? `has ${rest}`
    : ["i'll", 'i will'].includes(start) ? `will ${rest}`
    : start === 'my' ? `their ${rest}`
    : withVerbForThem(rest)
  return theirWords(fact)
}

/** "really love anime" -> "really loves anime": the first word that isn't an adverb gets the -s. */
function withVerbForThem(rest: string): string {
  const words = rest.split(' ')
  const index = words.findIndex((word) => !ADVERB.test(word))
  if (index === -1) return rest
  const verb = words[index]
  const lower = verb.toLowerCase()
  words[index] = IRREGULAR[lower] ?? (SAME_FORM.test(lower) ? verb
    : /(s|sh|ch|x|z|o)$/.test(lower) ? `${verb}es`
    : /[^aeiou]y$/.test(lower) ? `${verb.slice(0, -1)}ies`
    : `${verb}s`)
  return words.join(' ')
}

/** First person to third person inside a sentence: "my" -> "their", "me" -> "them", "I'm" -> "they're". */
function theirWords(text: string): string {
  return text
    .replace(/\bI'm\b/gi, "they're")
    .replace(/\bI am\b/gi, 'they are')
    .replace(/\bI was\b/gi, 'they were')
    .replace(/\bI've\b/gi, "they've")
    .replace(/\bI'll\b/gi, "they'll")
    .replace(/\bI\b/gi, 'they')
    .replace(/\bmyself\b/gi, 'themselves')
    .replace(/\bmine\b/gi, 'theirs')
    .replace(/\bmy\b/gi, 'their')
    .replace(/\bme\b/gi, 'them')
    // "we" is the user and whoever the sentence is about: "Jake spots them and they watch anime".
    .replace(/\bwe\b/gi, 'they')
    .replace(/\bour\b/gi, 'their')
    .replace(/\bus\b/gi, 'them')
    .replace(/[.!]+$/, '')
    .trim()
}
