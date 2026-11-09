/**
 * AI Horde drawing (server/images/horde.ts) against a fake Horde: the request it sends, waiting
 * for the picture, downloading it, and giving up on a request that failed. No network is used.
 * Run with `npm test` (about 7 seconds: the module waits 3 s between status checks).
 */
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { drawImage, imageExtension, stylePrompt } from './horde.ts'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** A WebP file header followed by enough bytes to count as a real picture. */
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(4000, 1)])

/** Answer the Horde's endpoints: submit, check (done or faulted), status, and the image download. */
function fakeHorde(check: { done?: boolean; faulted?: boolean }) {
  const calls: { url: string; body: any }[] = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
    if (url.endsWith('/generate/async')) return Response.json({ id: 'job-1' })
    if (url.includes('/generate/check/job-1')) return Response.json(check)
    if (url.includes('/generate/status/job-1')) return Response.json({ generations: [{ img: 'https://images.test/job-1.webp', censored: false }] })
    if (url === 'https://images.test/job-1.webp') return new Response(WEBP)
    return new Response('not found', { status: 404 })
  }) as typeof fetch
  return calls
}

test('draws a picture: FLUX on the Horde, safe for work, the size asked for, and returns the bytes', { timeout: 15_000 }, async () => {
  const calls = fakeHorde({ done: true })
  const bytes = await drawImage({ prompt: stylePrompt('a red bike by a canal', 'post'), width: 768, height: 960 })
  assert.equal(bytes.length, WEBP.length)
  assert.equal(imageExtension(bytes), 'webp')
  const submit = calls.find((call) => call.url.endsWith('/generate/async'))?.body
  assert.match(submit.prompt, /^a red bike by a canal\. Candid smartphone photo/)
  assert.deepEqual([submit.params.width, submit.params.height], [768, 960])
  assert.equal(submit.nsfw, false)
  assert.ok(submit.models[0].includes('Flux.1-Schnell'))
  assert.deepEqual(calls.map((call) => call.url.split('/').slice(-2).join('/')), [
    'generate/async', 'check/job-1', 'status/job-1', 'images.test/job-1.webp',
  ])
})

test('a request the Horde gave up on is an error once the tries run out', { timeout: 15_000 }, async () => {
  fakeHorde({ faulted: true })
  const retries: number[] = []
  await assert.rejects(
    drawImage({ prompt: 'a cat', width: 512, height: 512 }, { attempts: 1, onRetry: (attempt) => retries.push(attempt) }),
    /faulted/,
  )
  assert.deepEqual(retries, []) // one try only, so no retry was announced
})

test('file types come from the bytes, and every kind of picture gets its own style', () => {
  assert.equal(imageExtension(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'jpg')
  assert.equal(imageExtension(Buffer.from([0x89, 0x50, 0x4e, 0x47])), 'png')
  assert.match(stylePrompt('Maya', 'avatar'), /profile picture/)
  assert.match(stylePrompt('a street at night', 'post', true), /Professional, polished/)
  assert.match(stylePrompt('a beach', 'story'), /Vertical smartphone photo/)
})
