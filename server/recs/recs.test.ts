/**
 * Recommendation tests through the real API. Sign-in is on (the test-only dev login), so two
 * people each get their own world: teaching Ana's world a topic (likes, a save, long looks, a reel
 * watched to the end) moves that topic up in her feed, Explore and Reels, while Ben's world, built
 * from the same library, doesn't change. Also: the events endpoint checks its input, paging never
 * repeats, an unlike takes its like back, suggestions follow profile visits, character prompts and
 * the living world lean toward what Ana likes, and pages are fast. Run with `npm test`.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import type { Account, Page, Post, SignedInAccount } from '../../shared/types.ts'

// Configuration is read when modules load, so set it before importing the app.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-recs-'))
process.env.AURA_DATA_DIR = dataDir
process.env.AURA_PROVIDER = 'offline'
process.env.AURA_DEV_LOGIN = '1'
delete process.env.GOOGLE_CLIENT_ID
delete process.env.GOOGLE_CLIENT_SECRET

const { createApp } = await import('../app.ts')
const { closeAccounts } = await import('../db/accounts.ts')
const { closeAllWorlds, withWorld } = await import('../db/index.ts')
const { userCard } = await import('../ai/prompts.ts')
const { userInfo } = await import('../sim/context.ts')
const { getPostRow } = await import('../repo/posts.ts')
const { loadCandidates } = await import('./catalog.ts')
const recs = await import('./index.ts')
const store = await import('./store.ts')

let server: Server
let base = ''

before(async () => {
  server = createApp().listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

after(() => {
  server.closeAllConnections()
  server.close()
  closeAllWorlds()
  closeAccounts()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

interface Person { token: string; account: SignedInAccount }

async function devLogin(email: string, name: string): Promise<Person> {
  const res = await fetch(`${base}/auth/dev`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, name }) })
  assert.equal(res.status, 200)
  return (await res.json()) as Person
}

async function call(who: Person | null, method: string, route: string, body?: unknown, contentType = 'application/json') {
  const headers: Record<string, string> = {}
  if (who) headers.authorization = `Bearer ${who.token}`
  if (body !== undefined) headers['content-type'] = contentType
  const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  const res = await fetch(`${base}/api${route}`, { method, headers, body: payload })
  return { status: res.status, body: (await res.json()) as unknown }
}

async function api<T>(who: Person, method: string, route: string, body?: unknown): Promise<T> {
  const { status, body: data } = await call(who, method, route, body)
  assert.ok(status < 300, `${method} ${route} answered ${status}: ${JSON.stringify(data)}`)
  return data as T
}

/** Every post of a ranked list, in order, by following its cursors. */
async function allPages(who: Person, route: string): Promise<Post[]> {
  const posts: Post[] = []
  let cursor: string | null = null
  do {
    const joiner = route.includes('?') ? '&' : '?'
    const page: Page<Post> = await api<Page<Post>>(who, 'GET', cursor ? `${route}${joiner}cursor=${cursor}` : route)
    posts.push(...page.items)
    cursor = page.nextCursor
  } while (cursor)
  return posts
}

/** Where the given posts sit in a list on average: 0 = all at the top, 1 = all at the bottom. */
function meanRank(list: Post[], ids: Set<string>): number {
  const positions = list.flatMap((post, index) => (ids.has(post.id) ? [index / list.length] : []))
  assert.ok(positions.length > 0, 'the list has some of these posts')
  return positions.reduce((sum, value) => sum + value, 0) / positions.length
}

const INTERESTS = ['music', 'books', 'travel']
let ana: Person
let ben: Person
/** The topic Ana's world gets taught. */
let topic = ''

test('two people sign in and build worlds from the same library', async () => {
  ana = await devLogin('ana@example.com', 'Ana Lima')
  ben = await devLogin('ben@example.com', 'Ben Okafor')
  for (const [who, username] of [[ana, 'ana.lima'], [ben, 'ben.okafor']] as const) {
    await api(who, 'POST', '/onboarding', {
      displayName: who.account.name, username, avatar: null, bio: '', pronouns: '', interests: INTERESTS, tier: 'popular', origin: 'college',
    })
  }
  // The topic to teach: not one of their interests, with plenty of posts and a few reels.
  const interestTopics = new Set(INTERESTS.flatMap(recs.topicsOfInterest))
  const candidates = withWorld(ana.account.id, () => loadCandidates({ now: Date.now() })).filter((post) => !post.mine)
  const counts = new Map<string, { posts: number; reels: number }>()
  for (const post of candidates) {
    const main = post.topics[0]
    if (!main || interestTopics.has(main)) continue
    const count = counts.get(main) ?? { posts: 0, reels: 0 }
    if (post.kind === 'reel') count.reels++
    else count.posts++
    counts.set(main, count)
  }
  topic = [...counts].filter(([, count]) => count.posts >= 10).sort((a, b) => b[1].reels - a[1].reels || b[1].posts - a[1].posts)[0][0]
  assert.ok(topic, 'found a topic to teach')
})

/** Posts in a world whose main topic is the taught one, split into the ones Ana touches and the rest. */
function topicPosts(who: Person) {
  const posts = withWorld(who.account.id, () => loadCandidates({ now: Date.now() })).filter((post) => !post.mine && post.topics[0] === topic)
  const photos = posts.filter((post) => post.kind !== 'reel')
  const reels = posts.filter((post) => post.kind === 'reel')
  return { photos, reels }
}

test('liking and lingering on one topic moves it up in that world only', async () => {
  const anaPosts = topicPosts(ana)
  const benPosts = topicPosts(ben)
  // Ana likes 3, saves 1 and looks at 4 for 9 seconds each, and watches one reel to the end.
  const liked = anaPosts.photos.slice(0, 3)
  const saved = anaPosts.photos.slice(3, 4)
  const looked = anaPosts.photos.slice(4, 8)
  const watched = anaPosts.reels.slice(0, 1)
  const touched = new Set([...liked, ...saved, ...looked, ...watched].map((post) => post.id))
  // What is measured: the topic's posts she never touched (touched ones sink as "already seen").
  const anaPhotos = new Set(anaPosts.photos.filter((post) => !touched.has(post.id)).map((post) => post.id))
  const anaReels = new Set(anaPosts.reels.filter((post) => !touched.has(post.id)).map((post) => post.id))
  const benPhotos = new Set(benPosts.photos.map((post) => post.id))

  const lists = async () => ({
    anaFeed: await allPages(ana, '/feed'), anaExplore: await allPages(ana, '/explore'), anaReels: await allPages(ana, '/reels'),
    benFeed: await allPages(ben, '/feed'), benExplore: await allPages(ben, '/explore'),
  })
  const before = await lists()

  for (const post of liked) await api(ana, 'POST', `/posts/${post.id}/like`)
  for (const post of saved) await api(ana, 'POST', `/posts/${post.id}/save`)
  const events = [
    ...looked.map((post) => ({ type: 'impression', postId: post.id, ms: 9000, at: Date.now() })),
    ...watched.map((post) => ({ type: 'reel_watch', postId: post.id, ms: 9000, complete: true, at: Date.now() })),
  ]
  const tracked = await api<{ accepted: number }>(ana, 'POST', '/events', { events })
  assert.equal(tracked.accepted, events.length)
  await new Promise((resolve) => setTimeout(resolve, 20)) // likes are learned once their responses finish

  const afterwards = await lists()
  const report = (name: string, list: keyof typeof before, ids: Set<string>) => {
    const was = meanRank(before[list], ids)
    const now = meanRank(afterwards[list], ids)
    console.log(`  #${topic} ${name}: average position ${(was * 100).toFixed(0)}% -> ${(now * 100).toFixed(0)}% of the list`)
    return { was, now }
  }
  const feed = report('Ana feed', 'anaFeed', anaPhotos)
  const explore = report('Ana explore', 'anaExplore', anaPhotos)
  const benFeed = report('Ben feed', 'benFeed', benPhotos)
  const benExplore = report('Ben explore', 'benExplore', benPhotos)
  assert.ok(feed.now < feed.was - 0.15, 'moved up in her feed')
  assert.ok(explore.now < explore.was - 0.2, 'moved up in her Explore')
  // Ben's world learned nothing. His lists only differ by the small per-session shuffle.
  withWorld(ben.account.id, () => {
    assert.equal(store.recentEvents(1).length, 0)
    assert.deepEqual([...store.readScores(Date.now()).topic], [])
  })
  assert.ok(Math.abs(benFeed.now - benFeed.was) < 0.15, "Ben's feed didn't change")
  assert.ok(Math.abs(benExplore.now - benExplore.was) < 0.15, "Ben's Explore didn't change")
  assert.ok(feed.now < benFeed.now - 0.15 && explore.now < benExplore.now - 0.15, 'the topic sits much higher for Ana than for Ben')
  if (anaReels.size > 0) {
    const reels = report('Ana reels', 'anaReels', anaReels)
    assert.ok(reels.now < reels.was, 'moved up in her Reels')
  }

  // The suggested posts in her feed now say why.
  const suggested = afterwards.anaFeed.filter((post) => post.suggested)
  assert.ok(suggested.some((post) => post.reason === `Because you like #${topic}`), 'a suggestion names the topic')
})

test('the events endpoint takes batches, checks them and reads beacons', async () => {
  assert.equal((await call(ana, 'POST', '/events', { events: 'nope' })).status, 400)
  assert.equal((await call(ana, 'POST', '/events', { events: Array.from({ length: 201 }, () => ({ type: 'search', query: 'x', at: 1 })) })).status, 400)
  assert.equal((await call(null, 'POST', '/events', { events: [] })).status, 401)
  const odd = await api<{ accepted: number }>(ana, 'POST', '/events', { events: [{ type: 'hack', postId: '../x' }, null, 'x', { type: 'impression' }] })
  assert.equal(odd.accepted, 0, 'unknown types and events without their ids are skipped')
  // navigator.sendBeacon sends text/plain; the endpoint reads it the same way.
  const beacon = await call(ana, 'POST', '/events', JSON.stringify({ events: [{ type: 'search', query: 'sunflower fields', at: Date.now() }] }), 'text/plain;charset=UTF-8')
  assert.deepEqual(beacon, { status: 200, body: { ok: true, accepted: 1 } })
  // The same search right away counts once.
  const again = await api<{ accepted: number }>(ana, 'POST', '/events', { events: [{ type: 'search', query: 'sunflower fields', at: Date.now() }] })
  assert.equal(again.accepted, 0)
})

test('pages never repeat, and asking for the same page twice gives the same page', async () => {
  for (const route of ['/feed', '/explore', '/reels']) {
    const posts = await allPages(ana, route)
    assert.equal(new Set(posts.map((post) => post.id)).size, posts.length, `${route}: no duplicates`)
    const first = await api<Page<Post>>(ana, 'GET', route)
    const second = await api<Page<Post>>(ana, 'GET', `${route}?cursor=${first.nextCursor}`)
    const retry = await api<Page<Post>>(ana, 'GET', `${route}?cursor=${first.nextCursor}`)
    assert.deepEqual(retry.items.map((post) => post.id), second.items.map((post) => post.id), `${route}: a retry gets the same page`)
  }
  // An Explore topic chip pages on its own.
  const topical = await allPages(ana, `/explore?topic=${topic}`)
  assert.ok(topical.length >= 10)
  assert.equal(new Set(topical.map((post) => post.id)).size, topical.length)
})

test('an unlike takes back exactly what the like counted', async () => {
  const [post] = topicPosts(ana).photos.slice(-1)
  const scoreNow = () => withWorld(ana.account.id, () => store.readScores(Date.now()).account.get(post.authorId) ?? 0)
  const start = scoreNow()
  await api(ana, 'POST', `/posts/${post.id}/like`)
  await api(ana, 'POST', `/posts/${post.id}/like`) // liking twice counts once
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(Math.abs(scoreNow() - start - 2) < 0.01, 'a like counts 2 for the author')
  await api(ana, 'DELETE', `/posts/${post.id}/like`)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(Math.abs(scoreNow() - start) < 0.01, 'the unlike took it back')
})

test('looking at the same post again soon counts as its single best look', async () => {
  const learned = withWorld(ana.account.id, () => store.readScores(Date.now()).account)
  const post = withWorld(ana.account.id, () => loadCandidates({ now: Date.now() })).find((item) => !item.mine && !learned.has(item.authorId))
  assert.ok(post)
  const scoreNow = () => withWorld(ana.account.id, () => store.readScores(Date.now()).account.get(post.authorId) ?? 0)
  const look = (ms: number) => ({ type: 'impression', postId: post.id, ms, at: Date.now() })
  // A scroll-past (-0.2), then a long look back (the best look: 0.8), then another long look (nothing more).
  await api(ana, 'POST', '/events', { events: [look(1200), look(9000), look(9000)] })
  assert.ok(Math.abs(scoreNow() - 0.8) < 0.01, `counted once as the best look (${scoreNow().toFixed(2)})`)
  const seen = withWorld(ana.account.id, () => store.readSeen().get(post.id))
  assert.equal(seen?.views, 3, 'every look still counts as seen')
})

test('suggested accounts follow what the user engages with', async () => {
  const before = await api<Account[]>(ana, 'GET', '/suggestions')
  const cast = before.filter((account) => account.kind === 'cast')
  assert.ok(cast.length >= 2, 'a few characters she does not follow')
  const last = cast[cast.length - 1]
  await api(ana, 'POST', '/events', { events: [{ type: 'profile_view', accountId: last.id, at: Date.now() }] })
  const theirPosts = withWorld(ana.account.id, () => loadCandidates({ now: Date.now() })).filter((post) => post.authorId === last.id).slice(0, 2)
  for (const post of theirPosts) await api(ana, 'POST', `/posts/${post.id}/like`)
  await new Promise((resolve) => setTimeout(resolve, 20))
  const afterwards = (await api<Account[]>(ana, 'GET', '/suggestions')).filter((account) => account.kind === 'cast')
  const rank = afterwards.findIndex((account) => account.id === last.id)
  // It moves up from last place. (Not always to first: a creator who posts about the taught topic can still beat it.)
  assert.ok(rank >= 0 && rank <= Math.floor(cast.length / 2), `the account she visited moved up from last to #${rank + 1} of ${cast.length}`)
})

test('character prompts and the living world lean toward what the user likes', () => {
  withWorld(ana.account.id, () => {
    const user = userInfo()
    assert.ok(user)
    assert.match(userCard(user), new RegExp(`Lately into: .*${recs.topicLabel(topic)}`))
    assert.deepEqual(recs.recentInterests(3).slice(0, 1), [recs.topicLabel(topic)])

    // Two library posts by two friends Ana never interacted with: one about the taught topic, one not.
    const posts = loadCandidates({ now: Date.now() })
    const onTopic = posts.find((post) => post.topics[0] === topic && post.kind !== 'reel')
    const offTopic = posts.find((post) => post.topics.length > 0 && !post.topics.includes(topic) && !INTERESTS.includes(post.topics[0]))
    assert.ok(onTopic && offTopic)
    const learned = store.readScores(Date.now()).account
    const friends = ['marcus', 'hana', 'tyler', 'sofia', 'kwame', 'leah', 'rafi', 'noor'].filter((id) => !learned.has(id))
    assert.ok(friends.length >= 2)
    // Same words as the real posts (caption plus what the picture shows), under a new id and author.
    const row = (id: string, authorId: string, from: typeof onTopic) => {
      const real = getPostRow(from.id)
      assert.ok(real)
      return { ...real, id, author_id: authorId, caption: from.text, ai_note: null, source_id: null, released: 0 }
    }
    const library = [row('p_lib1', friends[0], offTopic), row('p_lib2', friends[1], onTopic)]
    let picked = 0
    for (let i = 0; i < 300; i++) if (recs.pickLibraryPost(library)?.id === 'p_lib2') picked++
    assert.ok(picked > 180, `the post about #${topic} goes up first most of the time (${picked}/300)`)
  })
})

test('ranking a page takes a few milliseconds', async () => {
  const time = (fn: () => unknown) => {
    const started = performance.now()
    for (let i = 0; i < 20; i++) fn()
    return (performance.now() - started) / 20
  }
  const inWorld = (fn: () => unknown) => () => withWorld(ana.account.id, fn)
  const feed = time(inWorld(() => recs.rankedFeed(null)))
  const explore = time(inWorld(() => recs.rankedExplore(null, null)))
  const reels = time(inWorld(() => recs.rankedReels(null, null)))
  const started = performance.now()
  for (let i = 0; i < 10; i++) await api(ana, 'GET', '/feed')
  const http = (performance.now() - started) / 10
  console.log(`  average per page: feed ${feed.toFixed(1)} ms, explore ${explore.toFixed(1)} ms, reels ${reels.toFixed(1)} ms; GET /feed over HTTP ${http.toFixed(1)} ms`)
  for (const ms of [feed, explore, reels, http]) assert.ok(ms < 50, `under 50 ms (${ms.toFixed(1)})`)
})
