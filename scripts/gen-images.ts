/**
 * Draws every picture listed in content/cast.json and content/crowd.json.
 *
 *   npm run gen:images              # draw everything that is missing
 *   npm run gen:images -- --limit 5 # just a few (for testing)
 *
 * The drawing itself (AI Horde, the free FLUX.1 Schnell model, no account needed) lives in
 * server/images/horde.ts, which the server also uses for the new friends people describe at sign-up.
 * Files that already exist are skipped, so you can stop and rerun this at any time.
 * The most visible pictures (avatars, then posts that are already "live") are drawn first.
 */
import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from '../server/config.ts'
import { drawImage, stylePrompt, type PictureKind } from '../server/images/horde.ts'
import type { CastFile, CastImage, CrowdFile } from '../shared/cast.ts'

/** Pictures drawn at the same time (server/images/horde.ts also caps requests in flight). */
const WORKERS = 6

const args = process.argv.slice(2)
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity

type Job = CastImage & { kind: PictureKind; creator: boolean; priority: number }

const diskPath = (file: string) => path.join(ROOT, file.replace(/^\//, ''))

function collectJobs(): Job[] {
  const cast = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/cast.json'), 'utf8')) as CastFile
  const crowd = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/crowd.json'), 'utf8')) as CrowdFile
  const jobs: Job[] = []
  for (const person of cast.personas) {
    const creator = person.role === 'creator'
    jobs.push({ ...person.avatar, kind: 'avatar', creator, priority: 0 })
    for (const post of person.posts) {
      post.images.forEach((img, k) => jobs.push({ ...img, kind: 'post', creator, priority: post.released ? (k === 0 ? 2 : 4) : 5 }))
    }
    for (const story of person.stories) jobs.push({ ...story.image, kind: 'story', creator, priority: 3 })
    for (const reel of person.reels) for (const frame of reel.frames) jobs.push({ ...frame, kind: 'reel', creator, priority: 4 })
  }
  for (const preset of crowd.presets) jobs.push({ ...preset, kind: 'preset', creator: false, priority: 1 })
  for (const avatar of crowd.avatars) jobs.push({ ...avatar, kind: 'crowd', creator: false, priority: 6 })
  return jobs.sort((a, b) => a.priority - b.priority)
}

const failures: string[] = []

async function draw(job: Job): Promise<void> {
  const started = Date.now()
  try {
    const bytes = await drawImage(
      { prompt: stylePrompt(job.prompt, job.kind, job.creator), width: job.width, height: job.height },
      { onRetry: (attempt, error) => console.warn(`retry ${job.file} (attempt ${attempt}): ${error.message}`) },
    )
    fs.mkdirSync(path.dirname(diskPath(job.file)), { recursive: true })
    fs.writeFileSync(diskPath(job.file), bytes)
    console.log(`ok   ${job.file} (${((Date.now() - started) / 1000).toFixed(0)}s, ${Math.round(bytes.length / 1024)} KB)`)
  } catch (error) {
    failures.push(job.file)
    console.error(`FAIL ${job.file}: ${(error as Error).message}`)
  }
}

async function main() {
  const all = collectJobs()
  const todo = all.filter((job) => !fs.existsSync(diskPath(job.file))).slice(0, limit)
  console.log(`${all.length} images in total, ${all.length - todo.length} already drawn, ${todo.length} to draw now.`)
  let next = 0
  let finished = 0
  async function worker() {
    while (next < todo.length) {
      const job = todo[next++]
      await draw(job)
      finished++
      if (finished % 25 === 0) console.log(`--- progress: ${finished}/${todo.length} ---`)
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker))
  fs.mkdirSync(path.join(ROOT, 'content/.cache'), { recursive: true })
  fs.writeFileSync(path.join(ROOT, 'content/.cache/image-failures.json'), JSON.stringify(failures, null, 2))
  console.log(`Done. ${todo.length - failures.length} drawn, ${failures.length} failed${failures.length ? ' (rerun to retry)' : ''}.`)
}

await main()
