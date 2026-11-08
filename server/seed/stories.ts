/**
 * Stories at onboarding: about 60% of the cast have 1-2 stories up right now (posted 0.5-20 hours
 * ago); everyone else's stories wait in the library for the simulation. Besties, friends and
 * creators also get 1-2 highlights made from their stories.
 */
import type { CastPersona, CastStory } from '../../shared/cast.ts'
import { STORY_LIFETIME_MS } from '../config.ts'
import { bit, newId, q } from '../db/index.ts'
import { chance, randomBetween, randomInt } from '../repo/random.ts'
import { imageMedia } from './posts.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** The story's caption drawn over the photo, somewhere between the top and the bottom third. */
function overlayFor(story: CastStory): string | null {
  if (!story.text) return null
  return JSON.stringify({ text: story.text, color: '#ffffff', background: 'rgba(0,0,0,0.35)', y: Number(randomBetween(0.2, 0.75).toFixed(2)) })
}

function insertStory(authorId: string, story: CastStory, released: boolean, createdAt: number): string {
  const id = newId('s')
  q(`INSERT INTO stories (id, author_id, media, overlay, source_id, released, seen, view_count, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`).run(
    id, authorId, JSON.stringify(imageMedia(story.image)), overlayFor(story), story.id, bit(released),
    createdAt, createdAt + STORY_LIFETIME_MS,
  )
  return id
}

/**
 * 1-2 highlights of old (expired) copies of their stories. Copies keep the library untouched.
 * Each is named after the month its stories are from ("september"): the stories in it are a
 * mix, so a topic name ("karaoke") would rarely match what's inside.
 */
function seedHighlights(persona: CastPersona, time: number): void {
  const stories = persona.stories ?? []
  if (stories.length === 0) return
  const count = stories.length >= 2 && chance(0.5) ? 2 : 1
  const titles: string[] = []

  for (let index = 0; index < count; index++) {
    const group = stories.filter((_, storyIndex) => storyIndex % count === index)
    const postedAt = time - randomInt(10, 120) * DAY
    const month = new Date(postedAt).toLocaleString('en-US', { month: 'long' }).toLowerCase()
    const title = titles.includes(month) ? 'faves' : month // two from the same month
    titles.push(title)
    const storyIds = group.map((story, order) => insertStory(persona.id, story, true, postedAt + order * 5 * MINUTE))
    q('INSERT INTO highlights (id, account_id, title, cover, story_ids, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(newId('h'), persona.id, title, group[0].image.file, JSON.stringify(storyIds), postedAt)
  }
}

export function seedStories(cast: CastPersona[], time: number): void {
  for (const persona of cast) {
    const stories = persona.stories ?? []
    const activeCount = stories.length > 0 && chance(0.6) ? Math.min(stories.length, randomInt(1, 2)) : 0
    // Ages sorted oldest first, so the tray plays their stories in order.
    const ages = Array.from({ length: activeCount }, () => randomBetween(0.5, 20) * HOUR).sort((a, b) => b - a)
    stories.forEach((story, index) => {
      if (index < activeCount) insertStory(persona.id, story, true, time - ages[index])
      else insertStory(persona.id, story, false, time) // library: released later by the sim
    })
    if (persona.role === 'bestie' || persona.role === 'friend' || persona.role === 'creator') seedHighlights(persona, time)
  }
}
