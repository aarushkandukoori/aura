/**
 * Draws every picture listed in content/cast.json and content/crowd.json.
 *
 *   npm run gen:images              # draw everything that is missing
 *   npm run gen:images -- --limit 5 # just a few (for testing)
 *
 * Images come from AI Horde (aihorde.net), a free, volunteer-run network of GPUs, using the FLUX.1
 * Schnell model. No account or key is needed: anonymous requests are just lower priority.
 * Files that already exist are skipped, so you can stop and rerun this at any time.
 * The most visible pictures (avatars, then posts that are already "live") are drawn first.
 */
import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from '../server/config.ts'
import type { CastFile, CastImage, CrowdFile } from '../shared/cast.ts'

const HORDE = 'https://aihorde.net/api/v2'
const HEADERS = { apikey: '0000000000', 'Client-Agent': 'aura-local:0.1:anonymous', 'Content-Type': 'application/json' }
const MODELS = ['Flux.1-Schnell fp8 (Compact)']
const IN_FLIGHT = 6           // requests waiting on the Horde at once
const SUBMIT_GAP_MS = 700     // the Horde allows about 2 submissions per second
const MAX_ATTEMPTS = 4

const args = process.argv.slice(2)
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity

type Job = CastImage & { kind: 'avatar' | 'post' | 'story' | 'reel' | 'crowd' | 'preset'; creator: boolean; priority: number }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const diskPath = (file: string) => path.join(ROOT, file.replace(/^\//, ''))

/** A short style tail so FLUX draws believable phone photos instead of glossy renders. */
function styled(job: Job): string {
  switch (job.kind) {
    case 'avatar':
    case 'crowd':
      return `${job.prompt}. Close-up profile picture, natural light, realistic photo, sharp focus.`
    case 'preset':
      return `${job.prompt}. Square image, soft and pleasant.`
    case 'story':
    case 'reel':
      return `${job.prompt}. Vertical smartphone photo, candid, realistic, natural colors.`
    default:
      return job.creator
        ? `${job.prompt}. Professional, polished photo, beautiful light, realistic detail.`
        : `${job.prompt}. Candid smartphone photo, natural lighting, realistic, true-to-life colors.`
  }
}

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

async function horde(pathname: string, init?: RequestInit): Promise<any> {
  const response = await fetch(`${HORDE}${pathname}`, { ...init, headers: HEADERS, signal: AbortSignal.timeout(30_000) })
  const text = await response.text()
  let body: any
  try {
    body = JSON.parse(text)
  } catch {
    body = { message: text.slice(0, 200) }
  }
  if (!response.ok) throw Object.assign(new Error(body?.message ?? `HTTP ${response.status}`), { status: response.status })
  return body
}

let lastSubmit = 0
async function submit(job: Job): Promise<string> {
  const wait = lastSubmit + SUBMIT_GAP_MS - Date.now()
  lastSubmit = Date.now() + Math.max(0, wait)
  if (wait > 0) await sleep(wait)
  const body = await horde('/generate/async', {
    method: 'POST',
    body: JSON.stringify({
      prompt: styled(job),
      params: { width: job.width, height: job.height, steps: 4, sampler_name: 'k_euler', cfg_scale: 1, n: 1 },
      models: MODELS,
      nsfw: false,
      censor_nsfw: true,
      r2: true,
      shared: false,
      slow_workers: true,
    }),
  })
  if (!body.id) throw new Error(body.message ?? 'no request id')
  return body.id as string
}

/** Wait for one request to finish and return the image URL. */
async function waitFor(id: string): Promise<string> {
  const started = Date.now()
  while (Date.now() - started < 10 * 60_000) {
    await sleep(3000)
    const check = await horde(`/generate/check/${id}`)
    if (check.faulted) throw new Error('generation faulted')
    if (check.is_possible === false) throw new Error('no worker can take this request')
    if (check.done) {
      const status = await horde(`/generate/status/${id}`)
      const generation = status.generations?.[0]
      if (!generation?.img) throw new Error('finished without an image')
      if (generation.censored) throw new Error('image was censored')
      return generation.img as string
    }
  }
  await horde(`/generate/status/${id}`, { method: 'DELETE' }).catch(() => {})
  throw new Error('timed out after 10 minutes')
}

async function draw(job: Job): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now()
    try {
      const id = await submit(job)
      const url = await waitFor(id)
      const image = await fetch(url, { signal: AbortSignal.timeout(60_000) })
      if (!image.ok) throw new Error(`download failed: HTTP ${image.status}`)
      const bytes = Buffer.from(await image.arrayBuffer())
      if (bytes.length < 2000) throw new Error('image too small')
      fs.mkdirSync(path.dirname(diskPath(job.file)), { recursive: true })
      fs.writeFileSync(diskPath(job.file), bytes)
      console.log(`ok   ${job.file} (${((Date.now() - started) / 1000).toFixed(0)}s, ${Math.round(bytes.length / 1024)} KB)`)
      return
    } catch (error) {
      const err = error as Error & { status?: number }
      console.warn(`retry ${job.file} (attempt ${attempt}): ${err.message}`)
      // 429 = too many requests: back off longer.
      await sleep(err.status === 429 ? 15_000 * attempt : 4000 * attempt)
    }
  }
  failures.push(job.file)
  console.error(`FAIL ${job.file}`)
}

const failures: string[] = []

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
  await Promise.all(Array.from({ length: IN_FLIGHT }, worker))
  fs.writeFileSync(path.join(ROOT, 'content/.cache/image-failures.json'), JSON.stringify(failures, null, 2))
  console.log(`Done. ${todo.length - failures.length} drawn, ${failures.length} failed${failures.length ? ' (rerun to retry)' : ''}.`)
}

await main()
