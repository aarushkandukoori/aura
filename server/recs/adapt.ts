/**
 * The living world adapts to the user:
 * - When a character posts from their library, or puts up a story, the simulation asks which one.
 *   Things the user is likely to enjoy go first, with some chance mixed in so it never feels scripted.
 * - Character prompts mention what the user has been into lately, so DMs and group chats drift
 *   toward it (server/ai/prompts.ts).
 */
import { hasWorld, q } from '../db/index.ts'
import { jsonList, type PostRow, type StoryRow } from '../repo/rows.ts'
import { loadAuthors, postTopics, storyTopics } from './catalog.ts'
import { currentTaste } from './rank.ts'
import { authorPreference, topicMatch } from './score.ts'
import { readScores } from './store.ts'
import { topicLabel } from './topics.ts'

/** How often the best, second and third candidate gets picked. */
const PICK_ODDS = [0.6, 0.25, 0.15]
/** People the user follows post first: their posts reach the feed, strangers' don't. */
const FOLLOWED_BONUS = 1.0

/**
 * Pick one library item to release. Each character's library keeps its own order (stories can
 * follow on from each other), so only each character's next item is a candidate. Candidates are
 * scored by how much the user likes the author and the item's topics, and one of the best three
 * is picked at random, the best most often.
 */
function pickNext<T extends { author_id: string }>(library: T[], topicsOf: (item: T) => string[]): T | null {
  const nextByAuthor = new Map<string, T>()
  for (const item of library) if (!nextByAuthor.has(item.author_id)) nextByAuthor.set(item.author_id, item)
  if (nextByAuthor.size === 0) return null

  const taste = currentTaste()
  const authors = q('SELECT id, closeness, i_follow FROM accounts WHERE id IN (SELECT value FROM json_each(?))')
    .all(jsonList(nextByAuthor.keys())) as { id: string; closeness: number; i_follow: number }[]
  const ranked = authors
    .map((author) => {
      const item = nextByAuthor.get(author.id) as T
      const followed = author.i_follow === 1
      const score = 2.0 * authorPreference(taste, { id: author.id, closeness: author.closeness, followed })
        + 1.5 * topicMatch(taste, topicsOf(item))
        + (followed ? FOLLOWED_BONUS : 0)
      return { item, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, PICK_ODDS.length)
  if (ranked.length === 0) return null

  let roll = Math.random() * PICK_ODDS.slice(0, ranked.length).reduce((sum, odds) => sum + odds, 0)
  for (const [index, candidate] of ranked.entries()) {
    roll -= PICK_ODDS[index]
    if (roll < 0) return candidate.item
  }
  return ranked[0].item
}

/** Which library post a character should post next (null when the library is empty). */
export function pickLibraryPost(library: PostRow[]): PostRow | null {
  const authors = loadAuthors()
  return pickNext(library, (row) => postTopics(row, authors.get(row.author_id)?.look ?? ''))
}

/** Which library story a character should put up next (null when there are none). */
export function pickLibraryStory(library: StoryRow[]): StoryRow | null {
  return pickNext(library, storyTopics)
}

/**
 * What the user has been into lately, strongest first, as words for a prompt ("coffee", "movies
 * and TV"). Only topics they really engaged with (a score of 2 is about one like), and only inside a world.
 */
export function recentInterests(limit = 3, now = Date.now()): string[] {
  if (!hasWorld()) return []
  return [...readScores(now).topic]
    .filter(([, score]) => score >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([topic]) => topicLabel(topic))
}
