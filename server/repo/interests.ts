/**
 * Matching the user's interests ("music", "food", "fitness") against free text such as a
 * character's interests ("live music", "taco truck rankings") or a caption.
 *
 * Plain word matching misses a lot ("fitness" never appears in "powerlifting"), so the common
 * interests list a few related word starts. Anything not listed matches on its own words.
 */
import { escapeRegex } from './text.ts'

const RELATED: Record<string, string[]> = {
  music: ['music', 'song', 'guitar', 'vinyl', 'concert', 'karaoke', 'jazz', 'beat', 'playlist', 'open mic', 'band', 'album', 'soundcheck'],
  food: ['food', 'cook', 'recipe', 'bak', 'taco', 'ramen', 'pizza', 'jollof', 'pho', 'brunch', 'tamale', 'grill', 'spicy', 'restaurant', 'dinner', 'smoothie', 'deep-dish'],
  cooking: ['cook', 'recipe', 'bak', 'kitchen', 'grill', 'jollof', 'tamale', 'meal prep', 'food'],
  fitness: ['fitness', 'gym', 'lift', 'powerlifting', 'running', 'workout', 'hik', 'climb', 'boulder', 'cycling', 'yoga', 'meal prep', 'trail'],
  fashion: ['fashion', 'style', 'styling', 'thrift', 'vintage', 'outfit', 'sneaker', 'nail', 'hair', 'perfume', 'modest'],
  travel: ['travel', 'trip', 'train', 'abroad', 'flight', 'beach', 'snorkel', 'camping', 'road trip', 'language'],
  art: ['art', 'draw', 'sketch', 'paint', 'watercolor', 'pottery', 'design', 'zine', 'museum', 'craft', 'sticker', 'architecture'],
  photography: ['photo', 'camera', 'film photo', 'shoot', 'street photo'],
  gaming: ['gaming', 'gamer', 'video game', 'board game', 'esports', 'indie game'],
  books: ['book', 'read', 'reading', 'novel', 'library', 'poetry', 'fantasy novel', 'journal'],
  reading: ['book', 'read', 'reading', 'novel', 'library', 'poetry'],
  movies: ['movie', 'film', 'cinema', 'horror', 'rom-com', 'k-drama', 'telenovela', 'reality tv', 'broadway'],
  film: ['film', 'movie', 'cinema', 'horror', 'rom-com'],
  pets: ['pet', 'dog', 'cat', 'corgi', 'beagle', 'chihuahua', 'puppy', 'kitten', 'tripod', 'mochi'],
  animals: ['animal', 'pet', 'dog', 'cat', 'bird', 'turtle', 'corgi', 'beagle'],
  sports: ['sport', 'soccer', 'football', 'basketball', 'baseball', 'hockey', 'fantasy sports', 'league', 'gaelic'],
  nature: ['nature', 'hik', 'camp', 'camping', 'mountain', 'garden', 'plant', 'bird', 'outdoor', 'trail', 'sunrise', 'desert', 'sea', 'walk'],
  outdoors: ['outdoor', 'hik', 'camp', 'camping', 'mountain', 'trail', 'climb', 'boulder', 'snorkel', 'desert'],
  tech: ['tech', 'cod', 'keyboard', 'gadget', 'repair', 'computer', 'mechanical'],
  coffee: ['coffee', 'cafe', 'café', 'latte', 'espresso', 'cold brew', 'tea', 'matcha', 'chai', 'kissaten'],
  dance: ['danc', 'salsa', 'ballet', 'choreo', 'bollywood', 'line danc'],
  comedy: ['comedy', 'stand-up', 'joke', 'pun', 'meme'],
  beauty: ['beauty', 'makeup', 'skincare', 'nail', 'hair', 'perfume'],
}

const EMOJI: Record<string, string> = {
  music: '🎧', food: '🍜', cooking: '🍳', fitness: '💪', fashion: '👗', travel: '✈️', art: '🎨',
  photography: '📸', gaming: '🎮', books: '📚', reading: '📚', movies: '🎬', film: '🎬', pets: '🐾',
  animals: '🐾', sports: '🏀', nature: '🌿', outdoors: '🏕️', tech: '💻', coffee: '☕', dance: '💃',
  comedy: '😂', beauty: '💄',
}

/**
 * Most words above count as word starts ('cook' also matches cooking). These short ones would
 * match far too much that way ('pho' in photo, 'tea' in teacher, 'trip' in tripod, 'read' in
 * ready, 'camp' in campus), so they only match as whole words (a plural "s" is fine).
 */
const WHOLE_WORDS = new Set(['pho', 'tea', 'cat', 'pet', 'sea', 'trip', 'read', 'nail', 'camp'])

const patternCache = new Map<string, RegExp[]>()

/** Word starts that count as this interest, as case-insensitive regexes ("\bcook" matches "cooking"). */
function patternsFor(interest: string): RegExp[] {
  const key = interest.trim().toLowerCase()
  let patterns = patternCache.get(key)
  if (!patterns) {
    // Unknown interests match the whole phrase or any meaningful word in it.
    const words = RELATED[key] ?? [key, ...key.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 4)]
    patterns = words.filter(Boolean).map((word) => new RegExp(`\\b${escapeRegex(word)}${WHOLE_WORDS.has(word) ? 's?\\b' : ''}`, 'i'))
    patternCache.set(key, patterns)
  }
  return patterns
}

/** Does this text talk about this interest? */
export function matchesInterest(interest: string, text: string): boolean {
  return patternsFor(interest).some((pattern) => pattern.test(text))
}

/** How many of these interests the text touches (0 = none). */
export function interestScore(interests: readonly string[], text: string): number {
  return interests.filter((interest) => matchesInterest(interest, text)).length
}

/** An emoji for a group chat about this interest. */
export function interestEmoji(interest: string): string {
  return EMOJI[interest.trim().toLowerCase()] ?? '✨'
}
