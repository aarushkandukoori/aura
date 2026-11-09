/**
 * Sign-up tests: "describe your world". The user's words become a plan (the keyword version here:
 * these tests run offline), plans sent back by an app are checked field by field, building a world
 * from a plan gives the chosen characters their roles, stories and group chats, the welcome burst
 * lets the plan's besties text first, and a friend nobody in the cast fits joins Aura in steps.
 * Also: the Google account's photo is copied into the world. Run with `npm test`.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import type { LiveEvent, Session, SignedInAccount, WorldPlan } from '../../shared/types.ts'

// Configuration is read when modules load, so set it before importing the app.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-onboarding-'))
process.env.AURA_DATA_DIR = dataDir
process.env.AURA_PROVIDER = 'offline'
process.env.AURA_IMAGES = 'off'
process.env.AURA_DEV_LOGIN = '1'
delete process.env.GOOGLE_CLIENT_ID
delete process.env.GOOGLE_CLIENT_SECRET

const { createApp } = await import('../app.ts')
const { closeAccounts, saveUser } = await import('../db/accounts.ts')
const { closeAllWorlds, getSetting, q, setSetting, withWorld } = await import('../db/index.ts')
const { loadContent } = await import('../seed/content.ts')
const { cleanPlan } = await import('./clean.ts')
const { continueNewFriend } = await import('./new-friends.ts')
const { offlinePlan, toMemory } = await import('./offline.ts')
const { PLAN_CONCEPTS_KEY } = await import('./plan.ts')
const { welcomeUser } = await import('../sim/welcome.ts')

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

async function signIn(email: string, name: string): Promise<Person> {
  const res = await fetch(`${base}/auth/dev`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, name }),
  })
  assert.equal(res.status, 200)
  return (await res.json()) as Person
}

async function call(who: Person, method: string, route: string, body?: unknown): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { authorization: `Bearer ${who.token}` }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(`${base}/api${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: res.status, body: await res.json() }
}

/** Everything someone's live stream says, collected in the background. */
async function listen(who: Person): Promise<{ events: LiveEvent[]; stop: () => void }> {
  const controller = new AbortController()
  const res = await fetch(`${base}/api/live`, { headers: { authorization: `Bearer ${who.token}` }, signal: controller.signal })
  assert.ok(res.body)
  const events: LiveEvent[] = []
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  ;(async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) return
        buffer += decoder.decode(value, { stream: true })
        let end: number
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const data = buffer.slice(0, end).split('\n').find((line) => line.startsWith('data: '))
          buffer = buffer.slice(end + 2)
          if (data) events.push(JSON.parse(data.slice(6)) as LiveEvent)
        }
      }
    } catch {
      // aborted
    }
  })()
  return { events, stop: () => controller.abort() }
}

const GYM_TRANSCRIPT = "I'm a sophomore at UT Austin and I basically live at the gym. My best friend Jake spots me every morning "
  + 'and we watch anime every Friday night. I want to be pretty popular on campus.'

function onboardingBody(plan: WorldPlan, overrides: Record<string, unknown> = {}) {
  return {
    displayName: plan.displayName || 'Alex Rivera', username: plan.username, avatar: null, bio: plan.bio, pronouns: plan.pronouns,
    interests: plan.interests, tier: plan.tier, origin: plan.origin, plan, ...overrides,
  }
}

test('what the user says becomes a sensible plan (the keyword version when AI is off)', async () => {
  const alex = await signIn('alex@test.dev', 'Alex Rivera')
  const { status, body } = await call(alex, 'POST', '/onboarding/plan', { transcript: GYM_TRANSCRIPT, displayName: 'Alex Rivera' })
  assert.equal(status, 200, JSON.stringify(body))
  const plan = body as WorldPlan
  assert.equal(plan.displayName, 'Alex Rivera')
  assert.match(plan.username, /^[a-z0-9._]{3,24}$/)
  assert.ok(plan.interests.includes('fitness') && plan.interests.includes('anime'), plan.interests.join(', '))
  assert.equal(plan.tier, 'popular')
  assert.equal(plan.origin, 'college')

  const besties = plan.friends.filter((friend) => friend.role === 'bestie')
  assert.ok(besties.length >= 2 && besties.length <= 4)
  assert.ok(plan.friends.filter((friend) => friend.role === 'friend').length <= 8)
  assert.ok(plan.friends.every((friend) => friend.account?.avatar?.startsWith('/content/') && friend.account.role === friend.role))
  const chosen = new Set(plan.friends.map((friend) => friend.id))
  assert.ok(plan.groupChats.length >= 2 && plan.groupChats.length <= 4)
  assert.ok(plan.groupChats.every((group) => group.memberIds.length >= 2 && group.memberIds.every((id) => chosen.has(id))))
  assert.deepEqual(plan.newFriends.map((person) => [person.name, person.role]), [['Jake', 'bestie']])
  assert.ok(plan.memories.includes('basically lives at the gym'), plan.memories.join(' | '))
  assert.ok(plan.summary.length > 20)

  assert.equal((await call(alex, 'POST', '/onboarding/plan', { transcript: ' ' })).status, 400)
  // Asking again before the first answer (going back to change a word) waits its turn instead of failing.
  const twice = await Promise.all([1, 2].map(() => call(alex, 'POST', '/onboarding/plan', { transcript: GYM_TRANSCRIPT })))
  assert.deepEqual(twice.map((answer) => answer.status), [200, 200])
})

test('the keyword plan knows the characters by name and writes their stories around the user', () => {
  const { cast } = loadContent()
  const said = "I'm Cam and my best friend Maya and I climb every Sunday. My best friend Jake spots me at the gym. "
    + 'I want a cozy group chat and to be pretty popular, like campus famous.'
  const plan = cleanPlan(offlinePlan(said, 'Cam Lee', cast), { cast })
  // "my best friend Maya" is the character Maya (first among the besties), not a second, new Maya.
  assert.equal(plan.friends[0].id, 'maya')
  assert.equal(plan.friends[0].role, 'bestie')
  assert.deepEqual(plan.newFriends.map((person) => person.name), ['Jake'])
  assert.match(plan.newFriends[0].description, /^Cam's best friend Jake/)
  // Stories use the user's first name like the AI's plans, so the review screen reads naturally.
  assert.ok(plan.friends.every((friend) => !/\bthe user\b/.test(friend.relationship)), plan.friends[0].relationship)
  assert.match(plan.friends[0].relationship, /\bCam's\b/)
  // "pretty popular" and "campus famous" are the Popular tier, even next to "a cozy group chat".
  assert.equal(plan.tier, 'popular')
  assert.equal(cleanPlan(offlinePlan("I don't need to be popular, keep it small and cozy.", null, cast), { cast }).tier, 'rising')
})

test('first person becomes facts everyone knows', () => {
  assert.equal(toMemory("I'm a pediatric nurse"), 'is a pediatric nurse')
  assert.equal(toMemory('I really love cozy mysteries'), 'really loves cozy mysteries')
  assert.equal(toMemory('I watch anime with my roommate'), 'watches anime with their roommate')
  assert.equal(toMemory('My sister Ana sends me memes'), 'their sister Ana sends them memes')
  assert.equal(toMemory('I want to be famous'), null) // a wish about the app, not a fact
})

test('a plan from an app is checked field by field', () => {
  const { cast } = loadContent()
  const creator = cast.find((persona) => persona.role === 'creator')
  const fan = cast.find((persona) => persona.role === 'fan')
  const pickable = cast.filter((persona) => ['bestie', 'friend', 'mutual'].includes(persona.role))
  assert.ok(creator && fan && pickable.length >= 8)
  const plan = cleanPlan({
    displayName: 'x'.repeat(80),
    username: 'Explore',
    tier: 'galactic',
    interests: ['Lifting', 'lifting', '#anime', ''],
    friends: [
      { id: creator.id, role: 'bestie', relationship: 'a celebrity' },
      { id: fan.id, role: 'bestie', relationship: 'a fan' },
      { id: 'nobody', role: 'bestie', relationship: '?' },
      ...pickable.slice(0, 7).map((persona) => ({ id: persona.id, role: 'bestie', relationship: 'y'.repeat(500) })),
      { id: pickable[0].id, role: 'friend', relationship: 'twice' },
    ],
    groupChats: [
      { title: 'gym rats', emoji: 'no emoji here 💪🏽 ok', vibe: '', memberIds: [pickable[0].id, pickable[1].id, creator.id] },
      { title: 'Gym Rats', emoji: '🎌', vibe: 'same title', memberIds: [pickable[2].id, pickable[3].id] },
      { title: 'solo', emoji: '🙂', vibe: 'one member', memberIds: [pickable[4].id] },
    ],
    newFriends: ['Ana', 'Ben 2', 'Cy', 'Dee', 'Eve'].map((name) => ({ name, description: 'someone they love', role: 'creator' })),
    memories: ['lifts', 'lifts', 'is a sophomore.', 'z'.repeat(400)],
  }, { cast, fallbackName: 'Alex' })

  assert.equal(plan.displayName.length, 40)
  assert.notEqual(plan.username, 'explore') // an app page, so another handle
  assert.match(plan.username, /^[a-z0-9._]{3,24}$/)
  assert.equal(plan.tier, 'popular')
  assert.deepEqual(plan.interests, ['lifting', 'anime'])
  // Only pickable characters, each once; 4 besties, the rest friends.
  assert.deepEqual(plan.friends.map((friend) => friend.id), pickable.slice(0, 7).map((persona) => persona.id))
  assert.deepEqual(plan.friends.map((friend) => friend.role), ['bestie', 'bestie', 'bestie', 'bestie', 'friend', 'friend', 'friend'])
  assert.ok(plan.friends.every((friend) => friend.relationship.length <= 300))
  // Chats: chosen members only, titles unique, at least two members.
  assert.equal(plan.groupChats[0].title, 'gym rats')
  assert.equal(plan.groupChats[0].emoji, '💪🏽')
  assert.equal(plan.groupChats[0].vibe, 'friends catching up')
  assert.deepEqual(plan.groupChats[0].memberIds, [pickable[0].id, pickable[1].id])
  assert.ok(!plan.groupChats.some((group) => group.title === 'Gym Rats' || group.title === 'solo'))
  assert.ok(plan.groupChats.length >= 2) // topped up with the besties' chat
  // At most three, never a fan or creator, names without digits or symbols.
  assert.deepEqual(plan.newFriends.map((person) => [person.name, person.role]), [['Ana', 'friend'], ['Ben', 'friend'], ['Cy', 'friend']])
  assert.deepEqual(plan.memories.slice(0, 2), ['lifts', 'is a sophomore'])
  assert.ok(plan.memories.every((fact) => fact.length <= 160))
})

test('building from a plan: chosen people, their stories, the chats and what everyone knows', async () => {
  const remy = await signIn('remy@test.dev', 'Remy Lee')
  const planned = (await call(remy, 'POST', '/onboarding/plan', { transcript: GYM_TRANSCRIPT, displayName: 'Remy Lee' })).body as WorldPlan
  const { cast } = loadContent()
  const [first, second, third, fourth, fifth] = cast.filter((persona) => persona.role === 'friend' || persona.role === 'mutual')
  const droppedBestie = cast.find((persona) => persona.role === 'bestie')
  assert.ok(first && second && third && fourth && fifth && droppedBestie)
  // An AI-style plan: relationships written with the user's first name, chats from their life.
  const plan: WorldPlan = {
    ...planned,
    displayName: 'Remy',
    friends: [
      { id: second.id, role: 'bestie', relationship: `${second.displayName.split(' ')[0]} has spotted Remy at the 6am gym since freshman year.`, account: null },
      { id: first.id, role: 'bestie', relationship: "Remy's anime night co-host.", account: null },
      { id: third.id, role: 'friend', relationship: 'Lifts with Remy on Saturdays.', account: null },
      { id: fourth.id, role: 'friend', relationship: 'Cosplays with Remy.', account: null },
      { id: fifth.id, role: 'friend', relationship: "Remy's lab partner.", account: null },
    ],
    groupChats: [
      { title: '6am crew', emoji: '🏋️', vibe: 'PR videos and protein memes', memberIds: [second.id, third.id] },
      { title: 'anime night', emoji: '🎌', vibe: 'Friday episode reactions', memberIds: [first.id, fourth.id, fifth.id] },
    ],
    memories: ['is a sophomore at UT Austin', 'basically lives at the gym'],
  }
  // What the plan call would have saved: the second character's new "who they are" line.
  withWorld(remy.account.id, () => setSetting(PLAN_CONCEPTS_KEY, { [second.id]: 'A powerlifting physical therapist in Austin.' }))

  const { status, body } = await call(remy, 'POST', '/onboarding', onboardingBody(plan, { displayName: 'Remy Lee', username: 'remy.lifts' }))
  assert.equal(status, 200, JSON.stringify(body))
  assert.equal((body as Session).onboarded, true)

  withWorld(remy.account.id, () => {
    const row = (id: string) => q('SELECT role, closeness, persona FROM accounts WHERE id = ?').get(id) as { role: string; closeness: number; persona: string }
    const persona = (id: string) => JSON.parse(row(id).persona) as { relationship: string; concept: string }
    assert.equal(row(second.id).role, 'bestie')
    assert.equal(row(first.id).role, 'bestie')
    assert.ok(row(second.id).closeness > row(first.id).closeness) // the plan's order: first named is closest
    assert.equal(row(third.id).role, 'friend')
    // Stored about "the user", so a later name change still reads right.
    assert.match(persona(second.id).relationship, /the user at the 6am gym/)
    assert.equal(persona(first.id).relationship, "the user's anime night co-host.")
    assert.equal(persona(second.id).concept, 'A powerlifting physical therapist in Austin.')
    // A bestie the plan didn't pick is now someone they know a little.
    assert.equal(row(droppedBestie.id).role, 'mutual')
    assert.match(persona(droppedBestie.id).relationship, /close with the user a while back/)

    const groups = q("SELECT title, emoji, vibe, members FROM conversations WHERE kind = 'group' ORDER BY created_at, title").all() as { title: string; members: string }[]
    assert.deepEqual(groups.map((group) => group.title).sort(), ['6am crew', 'anime night'])
    const memories = q("SELECT fact FROM memories WHERE account_id = '*'").all() as { fact: string }[]
    assert.deepEqual(memories.map((memory) => memory.fact).sort(), ['basically lives at the gym', 'is a sophomore at UT Austin'])
    assert.deepEqual(getSetting<{ besties: string[] }>('worldPlan', { besties: [] }).besties, [second.id, first.id])
    assert.deepEqual(getSetting<string[]>('newFriends', []), ['nf1'])
  })

  // The welcome burst: the plan's two besties DM, and before the group chats light up.
  await withWorld(remy.account.id, () => welcomeUser())
  withWorld(remy.account.id, () => {
    const jobs = q("SELECT kind, run_at, payload FROM jobs WHERE kind IN ('cast_dm', 'group_lines') ORDER BY run_at").all() as { kind: string; run_at: number; payload: string }[]
    const dms = jobs.filter((job) => job.kind === 'cast_dm' && !JSON.parse(job.payload).isRequest)
    assert.deepEqual(dms.map((job) => JSON.parse(job.payload).accountId).sort(), [first.id, second.id].sort())
    assert.equal(jobs[0].kind, 'cast_dm')
    const firstGroup = jobs.find((job) => job.kind === 'group_lines')
    assert.ok(firstGroup && firstGroup.run_at > dms[0].run_at)
    // ...and the friend nobody in the cast fits starts joining.
    assert.ok(q("SELECT 1 FROM jobs WHERE kind = 'new_friend' AND json_extract(payload, '$.newFriend') = 'nf1'").get())
  })
})

test('a friend nobody in the cast fits joins Aura: account, placeholder, banner, follow and a first DM', async () => {
  const jo = await signIn('jo@test.dev', 'Jo Kim')
  const plan = (await call(jo, 'POST', '/onboarding/plan', { transcript: GYM_TRANSCRIPT, displayName: 'Jo Kim' })).body as WorldPlan
  assert.equal((await call(jo, 'POST', '/onboarding', onboardingBody(plan, { displayName: 'Jo Kim', username: 'jo.kim' }))).status, 200)
  const live = await listen(jo)

  // Step 1 writes Jake (templates offline): an account the user follows, no picture yet.
  await withWorld(jo.account.id, () => continueNewFriend('nf1'))
  const jake = withWorld(jo.account.id, () => q("SELECT * FROM accounts WHERE display_name = 'Jake'").get() as Record<string, unknown> | undefined)
  assert.ok(jake)
  assert.equal(jake.kind, 'cast')
  assert.equal(jake.role, 'bestie')
  assert.equal(jake.avatar, null)
  assert.equal(jake.i_follow, 1)
  assert.equal(jake.follows_me, 0)

  // Step 2 (no pictures to draw here) joins: they follow back, the banner shows, a first DM is on its way.
  await withWorld(jo.account.id, () => continueNewFriend('nf1'))
  await new Promise((resolve) => setTimeout(resolve, 100))
  live.stop()
  withWorld(jo.account.id, () => {
    assert.equal((q('SELECT follows_me FROM accounts WHERE id = ?').get(jake.id as string) as { follows_me: number }).follows_me, 1)
    const dm = q("SELECT payload FROM jobs WHERE kind = 'cast_dm' AND json_extract(payload, '$.accountId') = ?").get(jake.id as string) as { payload: string } | undefined
    assert.ok(dm && JSON.parse(dm.payload).texts.length > 0)
    assert.equal(getSetting<{ step: string }>('newFriend:nf1', { step: '' }).step, 'joined')
  })
  const banner = live.events.find((event) => event.type === 'banner')
  assert.ok(banner && banner.type === 'banner' && banner.title === 'Jake joined Aura', JSON.stringify(live.events.map((event) => event.type)))
  // Running the step again changes nothing.
  await withWorld(jo.account.id, () => continueNewFriend('nf1'))
  withWorld(jo.account.id, () => assert.equal((q("SELECT COUNT(*) AS n FROM accounts WHERE display_name = 'Jake'").get() as { n: number }).n, 1))
})

test("the Google account's photo becomes the profile picture (copied into the world)", async () => {
  const kai = await signIn('kai@test.dev', 'Kai Moana')
  const picture = 'https://lh3.googleusercontent.com/a/test-picture=s96-c'
  saveUser({ googleSub: 'dev:kai@test.dev', email: 'kai@test.dev', name: 'Kai Moana', picture })
  const plan = (await call(kai, 'POST', '/onboarding/plan', { transcript: GYM_TRANSCRIPT })).body as WorldPlan

  // Google's image host, faked: only that URL is answered here, everything else goes to the real fetch.
  const realFetch = globalThis.fetch
  const asked: string[] = []
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(500, 7)])
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (!url.startsWith('https://lh3.googleusercontent.com/')) return realFetch(input, init)
    asked.push(url)
    return new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } })
  }) as typeof fetch
  try {
    const someoneElse = await call(kai, 'POST', '/onboarding', onboardingBody(plan, { avatar: 'https://lh3.googleusercontent.com/a/not-mine' }))
    assert.equal(someoneElse.status, 400) // only the account's own picture is ever fetched
    const { status, body } = await call(kai, 'POST', '/onboarding', onboardingBody(plan, { displayName: 'Kai Moana', avatar: picture }))
    assert.equal(status, 200, JSON.stringify(body))
    const avatar = (body as Session).me?.avatar ?? ''
    assert.match(avatar, new RegExp(`^/media/${kai.account.id}/[\\w-]+\\.jpg$`))
    assert.deepEqual(asked, ['https://lh3.googleusercontent.com/a/test-picture=s512-c'])
    const served = await realFetch(`${base}${avatar}`)
    assert.equal(served.status, 200)
    assert.equal(Buffer.from(await served.arrayBuffer()).length, jpeg.length)
  } finally {
    globalThis.fetch = realFetch
  }

  // Once the world is built, there's nothing left to plan.
  assert.equal((await call(kai, 'POST', '/onboarding/plan', { transcript: GYM_TRANSCRIPT })).status, 409)
})
