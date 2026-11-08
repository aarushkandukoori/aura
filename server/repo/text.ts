/**
 * Small text helpers shared by search, hashtags and mentions.
 */

/** Make text safe to put inside a RegExp. */
export const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Escape LIKE wildcards (use with ESCAPE '\'): "_" is common in usernames and must match literally. */
export const likeEscape = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`)

/** Hashtags in a caption: "#sunset" -> "sunset". Letters, digits and _ in any language. */
export function hashtagsIn(text: string): string[] {
  return [...text.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((match) => match[1].toLowerCase())
}

/** Does the text contain "@username" as a whole mention (not "@username2")? */
export function mentions(text: string, username: string): boolean {
  return new RegExp(`@${escapeRegex(username)}(?![a-z0-9._])`, 'i').test(text)
}
