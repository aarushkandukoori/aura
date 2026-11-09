/**
 * Tags every library post, reel and story with topics from the fixed list in server/recs/topics.ts,
 * once, with Claude, and writes content/topics.json. The recommendation algorithm prefers these
 * for library content (short captions like "🌅🐢" fool keyword rules); keyword rules still cover
 * the user's own posts and anything missing from the file.
 *
 *   npm run gen:topics                                            # the same as the next line
 *   node --env-file-if-exists=.env scripts/tag-topics.ts          # tags what is missing (~5 calls for everything)
 *   node --env-file-if-exists=.env scripts/tag-topics.ts --dry    # shows the batches, no AI
 *
 * Reruns only ask about items that aren't in the file yet, so a failed batch costs one more call.
 * The server reads the file once, so restart it after a rerun. New characters from gen:cast need a rerun.
 */
import fs from 'node:fs'
import path from 'node:path'
import { askJson } from '../server/ai/llm.ts'
import { ROOT } from '../server/config.ts'
import { TOPICS, type TopicsFile } from '../server/recs/topics.ts'
import type { CastFile } from '../shared/cast.ts'

const OUT = path.join(ROOT, 'content', 'topics.json')
/** Items per call: about 80 keeps every call small and the whole library at about 5 calls. */
const BATCH = 80
const MODEL = 'haiku'

const SYSTEM = `You label posts from a photo-sharing app with topics for its recommendation algorithm.
For each post, pick 1 to 3 topics from the allowed list that say what the post is about, the most important first.
Judge by the caption and by what the picture shows. Ignore background objects that aren't the point of the post (a mug on the table of a keyboard photo is not about coffee).
Only use topics from the allowed list.`

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, topics: { type: 'array', items: { type: 'string', enum: TOPICS } } },
      },
    },
  },
}

interface Item {
  id: string
  caption: string
  picture: string
}

const short = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

/** Every post, reel and story in content/cast.json, with the author's look replaced by their first name. */
function libraryItems(cast: CastFile): Item[] {
  const items: Item[] = []
  for (const person of cast.personas) {
    const firstName = person.displayName.split(' ')[0]
    const picture = (prompts: string[]) => short(prompts.map((prompt) => prompt.split(person.look).join(firstName)).join(' | '), 400)
    for (const post of person.posts) items.push({ id: post.id, caption: short(post.caption, 220), picture: picture(post.images.map((image) => image.prompt)) })
    for (const reel of person.reels) items.push({ id: reel.id, caption: short(reel.caption, 220), picture: picture(reel.frames.map((frame) => frame.prompt)) })
    for (const story of person.stories) items.push({ id: story.id, caption: story.text ?? '', picture: picture([story.image.prompt]) })
  }
  return items
}

function readExisting(): TopicsFile {
  try {
    return JSON.parse(fs.readFileSync(OUT, 'utf8')) as TopicsFile
  } catch {
    return { version: 1, generatedAt: '', model: '', topics: {} }
  }
}

async function tagBatch(items: Item[], index: number): Promise<Record<string, string[]>> {
  const lines = items.map((item) => `[${item.id}] caption: ${JSON.stringify(item.caption)} · picture: ${item.picture}`)
  const answer = await askJson<{ items: { id: string; topics: string[] }[] }>({
    label: `topics ${index + 1}`,
    system: SYSTEM,
    model: MODEL,
    timeoutMs: 240_000,
    maxTokens: 6000,
    schema: SCHEMA,
    prompt: `Allowed topics: ${TOPICS.join(', ')}\n\nLabel each of these ${items.length} posts (answer with every id):\n${lines.join('\n')}`,
  })
  const wanted = new Set(items.map((item) => item.id))
  const tagged: Record<string, string[]> = {}
  for (const item of answer.items ?? []) {
    const topics = [...new Set(item.topics.filter((topic) => TOPICS.includes(topic)))].slice(0, 3)
    if (wanted.has(item.id) && topics.length > 0) tagged[item.id] = topics
  }
  return tagged
}

const cast = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'cast.json'), 'utf8')) as CastFile
const file = readExisting()
const missing = libraryItems(cast).filter((item) => !file.topics[item.id])
const batches = Array.from({ length: Math.ceil(missing.length / BATCH) }, (_, i) => missing.slice(i * BATCH, (i + 1) * BATCH))
console.log(`${missing.length} items to tag in ${batches.length} calls (${Object.keys(file.topics).length} already tagged)`)

if (process.argv.includes('--dry')) {
  for (const [index, batch] of batches.entries()) console.log(`batch ${index + 1}: ${batch.length} items, e.g. [${batch[0]?.id}] ${batch[0]?.caption}`)
} else if (batches.length > 0) {
  const results = await Promise.allSettled(batches.map((batch, index) => tagBatch(batch, index)))
  for (const result of results) {
    if (result.status === 'fulfilled') Object.assign(file.topics, result.value)
    else console.warn(`a batch failed (run again to retry it): ${(result.reason as Error).message}`)
  }
  const sorted = Object.fromEntries(Object.entries(file.topics).sort(([a], [b]) => a.localeCompare(b)))
  const output: TopicsFile = { version: 1, generatedAt: new Date().toISOString(), model: MODEL, topics: sorted }
  fs.writeFileSync(OUT, `${JSON.stringify(output, null, 1)}\n`)
  console.log(`wrote ${Object.keys(sorted).length} tagged items to content/topics.json`)
}
