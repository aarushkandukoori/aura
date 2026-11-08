/**
 * The choices offered during onboarding (also reused by Edit profile) and username rules.
 */

/**
 * Interest chips. These words match the server's interest matching (server/repo/interests.ts),
 * so picking "fitness" also finds the powerlifter and the trail runner.
 */
export const INTERESTS: { value: string; emoji: string }[] = [
  { value: 'music', emoji: '🎧' },
  { value: 'food', emoji: '🍜' },
  { value: 'fitness', emoji: '💪' },
  { value: 'fashion', emoji: '👗' },
  { value: 'travel', emoji: '✈️' },
  { value: 'art', emoji: '🎨' },
  { value: 'photography', emoji: '📸' },
  { value: 'gaming', emoji: '🎮' },
  { value: 'books', emoji: '📚' },
  { value: 'movies', emoji: '🎬' },
  { value: 'pets', emoji: '🐾' },
  { value: 'sports', emoji: '🏀' },
  { value: 'nature', emoji: '🌿' },
  { value: 'tech', emoji: '💻' },
  { value: 'coffee', emoji: '☕' },
  { value: 'dance', emoji: '💃' },
  { value: 'comedy', emoji: '😂' },
  { value: 'beauty', emoji: '💄' },
  { value: 'cooking', emoji: '🍳' },
  { value: 'outdoors', emoji: '🏕️' },
]

export const MIN_INTERESTS = 3
/** The server accepts at most 12 interests. */
export const MAX_INTERESTS = 12

/** "How do you know your friends?" The value is stored as the user's `origin`. */
export const ORIGINS: { value: string; label: string; emoji: string; hint: string }[] = [
  { value: 'college', label: 'College', emoji: '🎓', hint: 'Dorm floors, study groups, late-night food runs' },
  { value: 'high school', label: 'High school', emoji: '🏫', hint: "You've known each other forever" },
  { value: 'work', label: 'Work', emoji: '💼', hint: 'Coworkers who became your people' },
  { value: 'online', label: 'Online', emoji: '🌐', hint: 'Group chats, games and fandoms' },
  { value: 'hometown', label: 'Hometown', emoji: '🏡', hint: 'Grew up a few streets apart' },
]

export const PRONOUNS = ['she/her', 'he/him', 'they/them']

/**
 * Words that are app pages: a profile at /explore or /settings could never be opened,
 * because those routes come first.
 */
const RESERVED_USERNAMES = new Set([
  'explore', 'reels', 'search', 'create', 'stories', 'highlights', 'messages', 'activity', 'settings', 'saved',
  'onboarding', 'api', 'media', 'content', 'assets',
])

/** Usernames: 3-24 lowercase letters, numbers, dots and underscores (same rule as the server). */
export function usernameError(username: string): string | null {
  if (username.length < 3) return 'Usernames need at least 3 characters.'
  if (username.length > 24) return 'Usernames can be at most 24 characters.'
  if (!/^[a-z0-9._]+$/.test(username)) return 'Use only letters, numbers, dots and underscores.'
  if (RESERVED_USERNAMES.has(username)) return "That username isn't available."
  return null
}

/** What the person typed, cleaned up as they type: lowercase, no spaces or other symbols. */
export function cleanUsername(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 24)
}

/** A username suggested from a name: "Zoë Park" -> "zoe.park". */
export function suggestUsername(displayName: string): string {
  const plain = displayName.normalize('NFKD').replace(/[̀-ͯ]/g, '') // drop accents
  return cleanUsername(plain.trim().toLowerCase().replace(/\s+/g, '.'))
}
