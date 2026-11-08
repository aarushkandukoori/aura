/**
 * Writing in a character's voice without AI, for the offline templates (server/ai/offline.ts).
 *
 * Each persona describes how they type, e.g. "All-lowercase gremlin, no punctuation ever ...
 * the skull emoji constantly". voiceOf() turns that description into a few mechanical rules
 * (lowercase, ALL CAPS, signature emoji, sign-offs) plus a broad tone that decides which bank of
 * lines fits them. Lines in server/sim/lines.ts are written plainly; inVoice() styles them.
 */
import type { CastMember } from '../repo/index.ts'
import { chance, pick, randomInt, shuffle } from '../repo/random.ts'

/** Which bank of lines suits someone. */
export type Tone = 'hype' | 'chaotic' | 'dry' | 'warm' | 'proper' | 'fan' | 'cool'

export interface Voice {
  tone: Tone
  caps: boolean
  lowercase: boolean
  capitalize: boolean
  /** Punctuation they leave out ("no punctuation ever", "no periods"). */
  dropPunctuation: RegExp | null
  endWithPeriod: boolean
  emojis: string[]
  emojiChance: number
  /** How many emoji they stack at once. */
  emojiCount: [number, number]
  shout: boolean
  /** Added to the end of every line: " 👍", " x". */
  ending: string | null
  keyboardSmash: boolean
  tilde: boolean
  /** How they open a DM ("Good evening"). */
  greeting: string | null
  /** How they sign longer DMs ("- M"). */
  signoff: string | null
}

/** Emoji names as personas describe them. Longer names first, so "crying-laughing" isn't read as "crying". */
const EMOJI_WORDS: [RegExp, string][] = [
  [/crying-laughing|laughing-crying/i, '😂'],
  [/heart-eyes/i, '😍'],
  [/white heart/i, '🤍'],
  [/pink heart/i, '🩷'],
  [/skull|skeleton/i, '💀'],
  [/\bfire\b/i, '🔥'],
  [/sparkle/i, '✨'],
  [/turtle/i, '🐢'],
  [/bicep/i, '💪'],
  [/\bgoat\b/i, '🐐'],
  [/thumbs-up/i, '👍'],
  [/crying/i, '😭'],
  [/camera/i, '📷'],
  [/mountain/i, '🏔️'],
  [/airplane/i, '✈️'],
  [/globe/i, '🌍'],
  [/paintbrush/i, '🖌️'],
  [/croissant/i, '🥐'],
  [/guitar/i, '🎸'],
  [/\bmoon\b/i, '🌙'],
  [/tooth/i, '🦷'],
  [/\bsun\b/i, '☀️'],
  [/tamale|food emoji/i, '🫔'],
  [/\bheart\b/i, '❤️'],
]

/** People who use "five to eight emojis per message" need a pool to draw from. */
const MAXIMALIST_EMOJIS = ['🥹', '✨', '😭', '💖', '🫶', '🎀', '🧋', '🌸']
const SMASHES = ['asdfghjkl', 'ASDKJFHSKDJ', 'skdjfhsk', 'asdfgh']

function emojisIn(text: string): string[] {
  let rest = text
  const found: string[] = []
  for (const [pattern, emoji] of EMOJI_WORDS) {
    if (!pattern.test(rest)) continue
    found.push(emoji)
    rest = rest.replace(pattern, '')
  }
  for (const emoji of text.match(/\p{Extended_Pictographic}/gu) ?? []) {
    if (!found.includes(emoji)) found.push(emoji)
  }
  // Old-school smileys count as emoji for the people who use them.
  for (const smiley of [':)', '<3']) if (text.includes(`'${smiley}'`)) found.push(smiley)
  return found
}

function toneOf(member: CastMember, voice: string): Tone {
  const everything = `${voice} ${member.persona.traits.join(' ')}`
  if (member.role === 'fan') return 'fan'
  if (/ALL CAPS|in CAPS/.test(voice) || /\bhype(d| man)?\b/i.test(everything)) return 'hype'
  if (/one or two words|one-word|brief|minimal|chic|poetic|laid-back/i.test(voice)) return 'cool'
  if (/deadpan|dry one-liners|comedic/i.test(everything)) return 'dry'
  if (/gremlin|keyboard smash|run-on|slang-heavy|emoji maximalist/i.test(voice)) return 'chaotic'
  if (/formal|perfect grammar|proper grammar|full sentences|semicolons|storytelling|good grammar/i.test(voice)) return 'proper'
  return 'warm'
}

/** A character's typing rules, read from their persona's description (cheap: a few regexes). */
export function voiceOf(member: CastMember): Voice {
  const text = member.persona.voice
  let emojis = emojisIn(text)

  // An emoji named in the "ends with ..." part of the description goes at the end of every line.
  const endClause = text.match(/\bend\w*\b[^.;,]*/i)?.[0] ?? ''
  let ending = /'x' or 'xx'/.test(text) ? ' x' : null
  const endEmoji = emojisIn(endClause)[0]
  if (endEmoji) {
    ending = ` ${endEmoji}`
    emojis = emojis.filter((emoji) => emoji !== endEmoji)
  }

  let emojiChance = emojis.length > 0 ? 0.55 : 0
  let emojiCount: [number, number] = [1, 1]
  if (/maximalist|five to eight/i.test(text)) {
    emojis = MAXIMALIST_EMOJIS
    emojiChance = 1
    emojiCount = [3, 5]
  } else if (/in threes/i.test(text)) {
    emojiChance = 0.9
    emojiCount = [3, 3]
  } else if (/almost never|no emoji|rare|sparingly/i.test(text)) {
    emojiChance = 0.12
  } else if (/never uses more than one|never more than one/i.test(text)) {
    emojiChance = 0.3
  } else if (/constantly|piles of/i.test(text)) {
    emojiChance = 0.85
    emojiCount = /piles of/i.test(text) ? [2, 3] : [1, 1]
  }

  const caps = /ALL CAPS/.test(text)
  return {
    tone: toneOf(member, text),
    caps,
    lowercase: !caps && /lowercase|capitalizes nothing/i.test(text),
    capitalize: /capital letter|proper capitalization|proper grammar|perfect grammar|good grammar|proper sentences|full sentences/i.test(text),
    // A mark right before a digit stays: "0.2 seconds" must not become "02 seconds".
    dropPunctuation: /no punctuation/i.test(text) ? /[.,!?;:](?!\d)/g : /no periods/i.test(text) ? /\.(?!\d)/g : null,
    endWithPeriod: /single period|and a period/i.test(text),
    emojis,
    emojiChance,
    emojiCount,
    shout: /exclamation/i.test(text),
    ending,
    keyboardSmash: /keyboard smash/i.test(text),
    tilde: /tilde/i.test(text),
    greeting: text.match(/writes '(.+?)' at the start|starts with '(.+?)'(?=[\s,.]|$)/i)?.slice(1).find(Boolean) ?? null,
    signoff: text.match(/signs off[^']*'(.+?)'/i)?.[1] ?? null,
  }
}

const hasEmoji = (text: string) => /\p{Extended_Pictographic}/u.test(text)

/** Lowercase every normal word but leave ALL-CAPS words (AHH, WAIT, PR) and @mentions alone. */
function lowercaseWords(text: string): string {
  return text.replace(/(^|[^@\w.])([A-Z][a-z'’]*)\b/g, (_match, before: string, word: string) => before + word.toLowerCase())
}

/** UPPERCASE everything except @mentions, which must keep pointing at real usernames. */
function uppercaseWords(text: string): string {
  return text.split(/(@[\w.]+)/).map((part, index) => (index % 2 === 1 ? part : part.toUpperCase())).join('')
}

/**
 * Only the mechanical part of a voice (case and punctuation), for text the AI wrote. The model
 * gets a character's style right but slips when they're excited ("WAIT??" from someone who
 * never uses punctuation); this keeps the rules consistent.
 */
export function keepVoice(text: string, member: CastMember): string {
  const voice = voiceOf(member)
  let result = text
  if (voice.caps) result = uppercaseWords(result)
  else if (voice.lowercase) result = lowercaseWords(result)
  if (voice.dropPunctuation) result = result.replace(voice.dropPunctuation, '')
  return result.trim()
}

export interface StyleOptions {
  /** A serious message: keep their capitalization habits but no jokes, emoji or shouting. */
  gentle?: boolean
  /** The first bubble of a DM they start (adds their greeting, e.g. "Good evening."). */
  opensDm?: boolean
  /** The last bubble of a longer DM (adds their sign-off, e.g. "- M"). */
  closesDm?: boolean
}

/** Style a plain line the way this character types. */
export function inVoice(line: string, member: CastMember, options: StyleOptions = {}): string {
  const voice = voiceOf(member)
  let text = line.trim()

  if (voice.caps && !options.gentle) text = uppercaseWords(text)
  else if (voice.lowercase) text = lowercaseWords(text)
  else if (voice.capitalize) text = text.charAt(0).toUpperCase() + text.slice(1)

  if (voice.dropPunctuation) text = text.replace(voice.dropPunctuation, '')
  if (voice.endWithPeriod && !hasEmoji(text)) text = `${text.replace(/[.!?\s]+$/, '')}.`
  if (options.opensDm && voice.greeting) text = `${voice.greeting.replace(/[.!]$/, '')}. ${text}`
  if (options.gentle) return text

  if (voice.shout) text = /\?$/.test(text) ? `${text}!!` : `${text.replace(/[.!]+$/, '')}!!!`
  if (voice.keyboardSmash && chance(0.2)) text = `${text} ${pick(SMASHES)}`
  if (!hasEmoji(text) && voice.emojis.length > 0 && chance(voice.emojiChance)) {
    const count = randomInt(voice.emojiCount[0], voice.emojiCount[1])
    const stack = voice.emojis === MAXIMALIST_EMOJIS ? shuffle(voice.emojis).slice(0, count) : Array(count).fill(pick(voice.emojis))
    text = `${text} ${stack.join('')}`
  }
  if (voice.tilde && chance(0.3)) text = `${text}~`
  if (voice.ending) text = voice.ending === ' x' && chance(0.4) ? `${text} xx` : `${text}${voice.ending}`
  if (options.closesDm && voice.signoff && chance(0.5)) text = `${text}\n${voice.signoff}`
  return text
}

// ----- picking lines ------------------------------------------------------------------------

/** Values for the {slots} in a line. A line whose slot has no value is skipped. */
export type Slots = Partial<Record<'name' | 'thing' | 'place' | 'them' | 'interest', string | null>>

/** Fill {name}, {thing}... in a line, or null when one of them has no value. */
export function fill(line: string, slots: Slots): string | null {
  let missing = false
  const filled = line.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = slots[key as keyof Slots]
    if (!value) missing = true
    return value ?? ''
  })
  return missing ? null : filled
}

/** Lines count as the same when only case, punctuation and emoji differ. */
export function sameLineKey(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/**
 * Was this line said already? `used` can hold texts as they were posted, with a voice's extras
 * around the line ("@sam.rivera stop 😭 x" is the line "stop 😭"), so a line that appears inside
 * one of them, as whole words, counts too.
 */
function alreadySaid(key: string, used: Set<string>): boolean {
  if (used.has(key)) return true
  return key !== '' && [...used].some((said) => ` ${said} `.includes(` ${key} `))
}

/**
 * A random line from a bank that fits the slots and hasn't been used yet. `used` holds the keys
 * of lines already said (in this post, or this chat), so nobody repeats a line.
 */
export function freshLine(bank: readonly string[], used: Set<string>, slots: Slots = {}): string | null {
  for (const line of shuffle(bank)) {
    const filled = fill(line, slots)
    if (!filled) continue
    const key = sameLineKey(filled)
    if (alreadySaid(key, used)) continue
    used.add(key)
    return filled
  }
  return null
}

// ----- reading what was said ----------------------------------------------------------------

/** What a message is mostly about. 'photo' is a message that is only a picture or a shared post. */
export type Intent =
  | 'crisis' | 'sad' | 'goodNews' | 'love' | 'thanks' | 'laugh' | 'howAreYou' | 'greeting' | 'plans' | 'question' | 'photo' | 'other'

/** First match wins, so the most important meaning (a crisis) is checked first. */
const INTENTS: [Intent, RegExp][] = [
  ['crisis', new RegExp([
    'kill myself', 'suicid', 'end it all', 'want to die', 'wanna die', 'self[- ]?harm', 'hurt myself',
    "don'?t want to (be here|live|exist)", 'no reason to live', 'better off without me',
  ].join('|'), 'i')],
  // Loss comes before good news, so "my grandpa passed" never gets a "WAIT no way!!".
  ['sad', /\b(sad|tired|exhausted|stress|anxious|anxiety|lonely|depress|rough|awful|terrible|bad day|crying|upset|overwhelm|homesick)/i],
  ['sad', /\b(passed away|died|funeral|grief|grieving|lost my|miscarriage|broke up|breakup)/i],
  ['goodNews', /\b(got the job|got in|got an offer|promot|accepted|engaged|i did it|good news|new job|we won|passed (the |my )?(exam|test|class|bar|interview))/i],
  ['love', /\b(love you|love u|ily|miss you|miss u)\b/i],
  ['thanks', /\b(thank|thx\b|ty\b|appreciat)/i],
  ['laugh', /\b(lol|lmao|lmfao|(ha){2,}|(he){2,})\b|😂|💀|🤣/i],
  ['howAreYou', /how are (you|u)|how'?s it going|how have you been|\bwyd\b|what'?s up/i],
  ['greeting', /^\s*(hi+|hey+|hello|yo|sup|good (morning|evening|night))\b/i],
  ['plans', /\b(tonight|tomorrow|weekend|saturday|sunday|friday|dinner|lunch|brunch|hang out|drinks|movie|party|come over)\b/i],
  ['question', /\?\s*$/],
]

/** What a message is mostly about, for picking a fitting reply. */
export function intentOf(text: string): Intent {
  return INTENTS.find(([, pattern]) => pattern.test(text))?.[0] ?? 'other'
}

/** Common photo subjects, so "level 10 wings i cannot feel my face" gives "wings", not "level". */
const SUBJECTS = new Set([
  'sunset', 'sunrise', 'golden hour', 'beach', 'ocean', 'lake', 'mountain', 'mountains', 'view', 'sky', 'snow', 'rain',
  'coffee', 'latte', 'matcha', 'brunch', 'dinner', 'tacos', 'ramen', 'pizza', 'sushi', 'cake', 'wings', 'burger',
  'croissant', 'bread', 'pasta', 'cat', 'dog', 'puppy', 'kitten', 'outfit', 'fit', 'hair', 'nails', 'book', 'books',
  'plant', 'plants', 'flowers', 'mug', 'concert', 'show', 'hike', 'trail', 'run', 'race', 'gym', 'game', 'party',
  'wedding', 'birthday', 'graduation', 'city', 'street', 'bridge', 'park', 'garden', 'museum', 'gallery', 'art',
  'painting', 'sketch', 'car', 'bike', 'train', 'flight', 'trip', 'apartment', 'kitchen', 'room', 'desk', 'window',
  'selfie', 'smile', 'glasses', 'jacket', 'shoes', 'sneakers', 'guitar', 'vinyl', 'record', 'camera', 'photo',
])

const STOPWORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'just', 'like', 'been', 'were', 'what', 'when', 'your', 'they', 'them',
  'then', 'than', 'very', 'really', 'about', 'there', 'their', 'would', 'could', 'should', 'cannot', 'still',
  'again', 'every', 'some', 'only', 'into', 'over', 'after', 'before', 'today', 'tonight', 'finally', 'literally',
  'feel', 'felt', 'much', 'more', 'most', 'here', 'where', 'which', 'while', 'being', 'doing', 'going', 'make',
  'made', 'know', 'think', 'want', 'need', 'look', 'looks', 'thing', 'things', 'time', 'year', 'week', 'days',
  // Days and moods say when or how, not what: "sunday mood with mochi" is about mochi.
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'weekend', 'morning', 'night',
  'mood', 'vibe', 'vibes',
])

/** The thing a caption is about, for lines like "the {thing} omg". Null when nothing fits. */
export function topicOf(text: string): string | null {
  const lower = text.toLowerCase()
  for (const tag of lower.match(/#(\w+)/g) ?? []) {
    const word = tag.slice(1)
    for (const subject of SUBJECTS) if (subject.replace(' ', '') === word) return subject
  }
  const words = lower.replace(/#\w+|@[\w.]+|https?:\S+/g, ' ').match(/[a-z][a-z-]+/g) ?? []
  const subject = words.find((word) => SUBJECTS.has(word))
  if (subject) return subject
  // Otherwise the longest real-looking word: keyboard smashes have almost no vowels, and
  // stretched words ("hereeee", "sooo") aren't things.
  const candidates = words.filter((word) =>
    word.length >= 4 && !STOPWORDS.has(word) && !/(.)\1\1/.test(word)
    && (word.match(/[aeiou]/g)?.length ?? 0) / word.length >= 0.25)
  return candidates.sort((a, b) => b.length - a.length)[0] ?? null
}
