/**
 * Drawing pictures with AI Horde (aihorde.net), a free, volunteer-run network of GPUs, using the
 * FLUX.1 Schnell model. No account or key is needed: anonymous requests are just lower priority,
 * so one picture takes about 10-60 seconds when the queue is short (longer when it's busy).
 *
 *   const bytes = await drawImage({ prompt: stylePrompt('a red bike by a canal', 'post'), width: 768, height: 960 })
 *
 * Used by scripts/gen-images.ts (the character library in content/) and by the server, which
 * draws the friends a new user describes during sign-up (server/onboarding/new-friends.ts).
 * Sizes must be multiples of 64 (512x512 avatars, 768x960 posts, 576x1024 stories and reels).
 */

const HORDE = 'https://aihorde.net/api/v2'
/** Ten zeros is AI Horde's documented anonymous key: no account, just a lower place in the queue. */
const HEADERS = { apikey: '0000000000', 'Client-Agent': 'aura:0.2:anonymous', 'Content-Type': 'application/json' }
const MODELS = ['Flux.1-Schnell fp8 (Compact)']
/** The Horde allows about 2 submissions per second. */
const SUBMIT_GAP_MS = 700
/** Requests waiting on the Horde at once, shared by everything in this process (script or server). */
const MAX_IN_FLIGHT = 6
const POLL_MS = 3_000
/** A request still waiting after this long is cancelled and tried again. */
const GIVE_UP_MS = 10 * 60_000

export type PictureKind = 'avatar' | 'post' | 'story' | 'reel' | 'crowd' | 'preset'

export interface DrawRequest {
  prompt: string
  width: number
  height: number
}

export interface DrawOptions {
  /** Tries before giving up (default 4). */
  attempts?: number
  /** Told about each failed try, e.g. to print "retry maya/p3 (attempt 2): ...". */
  onRetry?: (attempt: number, error: Error) => void
}

/**
 * Is drawing new pictures switched on? It needs the internet, so AURA_IMAGES=off turns it off.
 * Offline mode (AURA_PROVIDER=offline, no AI at all) also turns it off unless AURA_IMAGES=on.
 */
export function drawingEnabled(): boolean {
  if (process.env.AURA_IMAGES === 'on') return true
  if (process.env.AURA_IMAGES === 'off') return false
  return process.env.AURA_PROVIDER !== 'offline'
}

/** A short style tail so FLUX draws believable phone photos instead of glossy renders. */
export function stylePrompt(prompt: string, kind: PictureKind, polished = false): string {
  switch (kind) {
    case 'avatar':
    case 'crowd':
      return `${prompt}. Close-up profile picture, natural light, realistic photo, sharp focus.`
    case 'preset':
      return `${prompt}. Square image, soft and pleasant.`
    case 'story':
    case 'reel':
      return `${prompt}. Vertical smartphone photo, candid, realistic, natural colors.`
    default:
      return polished
        ? `${prompt}. Professional, polished photo, beautiful light, realistic detail.`
        : `${prompt}. Candid smartphone photo, natural lighting, realistic, true-to-life colors.`
  }
}

/** The file extension that fits the bytes the Horde sent back (it usually sends WebP). */
export function imageExtension(bytes: Buffer): 'webp' | 'png' | 'jpg' {
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp'
  if (bytes[0] === 0x89 && bytes.subarray(1, 4).toString('latin1') === 'PNG') return 'png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg'
  return 'webp'
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** An error with the HTTP status, so a 429 (too many requests) can back off longer. */
class HordeError extends Error {
  status: number
  constructor(message: string, status = 0) {
    super(message)
    this.status = status
  }
}

/** Draw one picture and return its bytes. Tries a few times before throwing. */
export async function drawImage(request: DrawRequest, options: DrawOptions = {}): Promise<Buffer> {
  const attempts = options.attempts ?? 4
  for (let attempt = 1; ; attempt++) {
    try {
      return await withSlot(() => drawOnce(request))
    } catch (error) {
      const err = error as HordeError
      if (attempt >= attempts) throw err
      options.onRetry?.(attempt, err)
      // 429 = too many requests: back off longer.
      await sleep(err.status === 429 ? 15_000 * attempt : 4_000 * attempt)
    }
  }
}

async function drawOnce(request: DrawRequest): Promise<Buffer> {
  const id = await submit(request)
  const url = await waitFor(id)
  const image = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!image.ok) throw new HordeError(`download failed: HTTP ${image.status}`, image.status)
  const bytes = Buffer.from(await image.arrayBuffer())
  if (bytes.length < 2000) throw new HordeError('image too small')
  return bytes
}

// ----- talking to the Horde -------------------------------------------------------------------

async function horde(pathname: string, init?: RequestInit): Promise<any> {
  const response = await fetch(`${HORDE}${pathname}`, { ...init, headers: HEADERS, signal: AbortSignal.timeout(30_000) })
  const text = await response.text()
  let body: any
  try {
    body = JSON.parse(text)
  } catch {
    body = { message: text.slice(0, 200) }
  }
  if (!response.ok) throw new HordeError(body?.message ?? `HTTP ${response.status}`, response.status)
  return body
}

let lastSubmit = 0

/** Queue one picture on the Horde and return the request id. Submissions are spaced out. */
async function submit(request: DrawRequest): Promise<string> {
  const wait = lastSubmit + SUBMIT_GAP_MS - Date.now()
  lastSubmit = Date.now() + Math.max(0, wait)
  if (wait > 0) await sleep(wait)
  const body = await horde('/generate/async', {
    method: 'POST',
    body: JSON.stringify({
      prompt: request.prompt,
      params: { width: request.width, height: request.height, steps: 4, sampler_name: 'k_euler', cfg_scale: 1, n: 1 },
      models: MODELS,
      nsfw: false,
      censor_nsfw: true,
      r2: true,
      shared: false,
      slow_workers: true,
    }),
  })
  if (!body.id) throw new HordeError(body.message ?? 'no request id')
  return body.id as string
}

/** Wait for one request to finish and return the image URL. */
async function waitFor(id: string): Promise<string> {
  const started = Date.now()
  while (Date.now() - started < GIVE_UP_MS) {
    await sleep(POLL_MS)
    const check = await horde(`/generate/check/${id}`)
    if (check.faulted) throw new HordeError('generation faulted')
    if (check.is_possible === false) throw new HordeError('no worker can take this request')
    if (check.done) {
      const status = await horde(`/generate/status/${id}`)
      const generation = status.generations?.[0]
      if (!generation?.img) throw new HordeError('finished without an image')
      if (generation.censored) throw new HordeError('image was censored')
      return generation.img as string
    }
  }
  await horde(`/generate/status/${id}`, { method: 'DELETE' }).catch(() => {})
  throw new HordeError('timed out after 10 minutes')
}

// ----- at most MAX_IN_FLIGHT requests at once -------------------------------------------------

let inFlight = 0
const waiting: (() => void)[] = []

async function withSlot<T>(work: () => Promise<T>): Promise<T> {
  // A loop, not an if: someone new may have taken the freed slot before this one woke up.
  while (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((resolve) => waiting.push(resolve))
  inFlight++
  try {
    return await work()
  } finally {
    inFlight--
    waiting.shift()?.()
  }
}
