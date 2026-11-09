/**
 * Recommendation math, without a database: time decay, how much a look or a reel watch counts,
 * preferences, topic tagging, the scoring formulas and the variety rules. Run with `npm test`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Candidate } from './catalog.ts'
import { addEvent, DAY_MS, decayFactor, HALF_LIFE_MS, valueAt } from './decay.ts'
import { dwellWeight, reelWeight } from './learn.ts'
import {
  buildTaste, emptyHistory, exploreScore, feedScore, isDiscovery, jitter, preference, reelScore, takeBest, topicMatch,
  type Scored, type Taste,
} from './score.ts'
import type { Seen } from './store.ts'
import { topicsOfInterest, topicsOfPostText, topicsOfText } from './topics.ts'

const NOW = Date.UTC(2026, 10, 8, 12)

/** A post with ordinary numbers; tests change only what they look at. */
function post(fields: Partial<Candidate> = {}): Candidate {
  return {
    id: 'p_test', authorId: 'maya', mine: false, followed: true, closeness: 0.7, kind: 'photo', topics: [],
    likes: 300, comments: 10, views: 0, shares: 0, likedByMe: false, savedByMe: false,
    createdAt: NOW - 5 * 3_600_000, ageHours: 5, text: '', ...fields,
  }
}

function taste(topics: Record<string, number> = {}, seen: Record<string, Seen> = {}, accounts: Record<string, number> = {}): Taste {
  return buildTaste(
    { topic: new Map(Object.entries(topics)), account: new Map(Object.entries(accounts)), exposure: new Map() },
    new Map(Object.entries(seen)),
    [],
  )
}

test('scores halve every three days, and late events land where they belong', () => {
  assert.equal(HALF_LIFE_MS, 3 * DAY_MS)
  assert.equal(decayFactor(0), 1)
  assert.equal(decayFactor(HALF_LIFE_MS), 0.5)
  assert.equal(decayFactor(2 * HALF_LIFE_MS), 0.25)
  assert.equal(valueAt({ value: 8, at: NOW }, NOW + 3 * DAY_MS), 4)

  const first = addEvent(null, 2, NOW)
  assert.deepEqual(first, { value: 2, at: NOW })
  const inOrder = addEvent(first, 2, NOW + HALF_LIFE_MS)
  assert.deepEqual(inOrder, { value: 3, at: NOW + HALF_LIFE_MS }, 'the old like is worth 1 by now, plus the new 2')
  // The same two likes arriving in the other order (apps send batches) give the same score.
  const outOfOrder = addEvent({ value: 2, at: NOW + HALF_LIFE_MS }, 2, NOW)
  assert.deepEqual(outOfOrder, inOrder)
})

test('a long look counts more than a scroll-past, and a reel watched to the end counts most', () => {
  assert.equal(dwellWeight(1000), -0.2, 'scrolling past is a small "not for me"')
  assert.equal(dwellWeight(2500), 0)
  assert.equal(dwellWeight(5000), 0.5)
  assert.equal(dwellWeight(60_000), 0.8, 'a look never counts more than 0.8')
  for (const [shorter, longer] of [[500, 2000], [2000, 4000], [4000, 9000]]) assert.ok(dwellWeight(shorter) < dwellWeight(longer))

  assert.equal(reelWeight(4000, true), 1.5)
  assert.equal(reelWeight(800, false), -0.4, 'swiping a reel away at once')
  assert.ok(reelWeight(6000, false) > 0 && reelWeight(6000, false) < reelWeight(6000, true))
})

test('preferences grow with every like, but each like helps a bit less', () => {
  assert.equal(preference(0), 0)
  assert.equal(preference(2), 0.25, 'one like')
  assert.equal(preference(6), 0.5, 'three likes')
  assert.equal(preference(-100), -0.5, 'skipping something a lot never goes below -0.5')
  const steps = [2, 4, 6, 8, 10].map((score) => preference(score))
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i] > steps[i - 1])
    if (i > 1) assert.ok(steps[i] - steps[i - 1] < steps[i - 1] - steps[i - 2], 'diminishing returns')
  }
  // Interests picked at sign-up count like a like and add to what was learned.
  const withInterest = buildTaste({ topic: new Map([['coffee', 2]]), account: new Map(), exposure: new Map() }, new Map(), ['coffee', 'travel'])
  assert.equal(withInterest.topics.get('coffee'), 4)
  assert.equal(withInterest.topics.get('travel'), 2)
})

test('topics come from captions, hashtags, emoji and picture notes', () => {
  assert.equal(topicsOfText('iced oat latte before class #coffee')[0], 'coffee')
  assert.deepEqual(topicsOfText('loading a roll of film into my film camera 📷'), ['photography'], 'film for a camera is photography')
  assert.ok(topicsOfText('movie night, popcorn and a horror double feature').includes('film'))
  assert.deepEqual(topicsOfText('🌮🌮🌮'), ['food'])
  assert.ok(!topicsOfText('my new knitted sweater').includes('fitness'), '"sweater" is not "sweat"')
  // The look every library prompt starts with is ignored, and the start of a note matters most.
  const look = 'woman in thrifted vintage jackets'
  const topics = topicsOfPostText({ caption: 'he judged me', note: `${look} holding a corgi on a kitchen floor, a mug of tea nearby` }, look)
  assert.deepEqual(topics, ['pets'], 'not fashion (the look), not cooking (a kitchen floor), not coffee (background tea)')
  assert.deepEqual(topicsOfInterest('movies'), ['film'])
  assert.deepEqual(topicsOfInterest('film photography'), ['photography'])
  assert.deepEqual(topicsOfInterest('taco truck rankings'), ['food'])
})

test('each surface puts what the user likes first, and already-seen posts last', () => {
  const coffeeFan = taste({ coffee: 8 })
  const coffee = post({ id: 'p_coffee', topics: ['coffee'] })
  const travel = post({ id: 'p_travel', topics: ['travel'] })
  for (const score of [exploreScore, feedScore, reelScore]) {
    assert.ok(score(coffeeFan, coffee, 's').score > score(coffeeFan, travel, 's').score, score.name)
  }
  // The main topic counts most.
  assert.ok(topicMatch(coffeeFan, ['coffee', 'travel']) > topicMatch(coffeeFan, ['travel', 'coffee']))

  const seenTwice = taste({ coffee: 8 }, { p_coffee: { views: 2, ms: 9000, completes: 0, lastAt: NOW } })
  assert.ok(exploreScore(seenTwice, coffee, 's').score < exploreScore(seenTwice, travel, 's').score, 'seen posts sink')
  assert.ok(exploreScore(coffeeFan, post({ topics: ['coffee'], likedByMe: true }), 's').score < exploreScore(coffeeFan, coffee, 's').score)

  // In the home feed, a new post beats the same post a few days old.
  assert.ok(feedScore(coffeeFan, post({ ageHours: 1 }), 's').score > feedScore(coffeeFan, post({ ageHours: 72 }), 's').score)
  // And close friends come before people the user hardly knows.
  assert.ok(feedScore(taste(), post({ closeness: 0.9 }), 's').score > feedScore(taste(), post({ closeness: 0.1 }), 's').score)
})

test('jitter is small, stable within a session and different across sessions', () => {
  const values = Array.from({ length: 200 }, (_, i) => jitter(`p_${i}`, 'session-a'))
  assert.ok(values.every((value) => value >= -0.5 && value < 0.5))
  assert.equal(jitter('p_1', 'session-a'), jitter('p_1', 'session-a'))
  assert.notEqual(jitter('p_1', 'session-a'), jitter('p_1', 'session-b'))
})

test('picking in order keeps runs of one author or one topic out', () => {
  // Six great posts by maya and three good ones by diego: maya never gets two in a row while diego has posts left.
  const pool: Scored[] = [
    ...Array.from({ length: 6 }, (_, i) => ({ post: post({ id: `m${i}`, authorId: 'maya', topics: [`t${i}`] }), score: 3, parts: {} })),
    ...Array.from({ length: 3 }, (_, i) => ({ post: post({ id: `d${i}`, authorId: 'diego', topics: [`u${i}`] }), score: 1, parts: {} })),
  ]
  const history = emptyHistory()
  const order: string[] = []
  for (let pick = takeBest(pool, history); pick; pick = takeBest(pool, history)) order.push(pick.post.authorId)
  const firstSix = order.slice(0, 6)
  assert.ok(firstSix.every((author, i) => i === 0 || author !== firstSix[i - 1]), `alternates: ${order.join(' ')}`)
  assert.equal(order.length, 9, 'everything is picked eventually')

  // Same idea for topics: a run of coffee posts loses to a slightly weaker post about something else.
  const topical: Scored[] = [
    ...Array.from({ length: 4 }, (_, i) => ({ post: post({ id: `c${i}`, authorId: `a${i}`, topics: ['coffee'] }), score: 2, parts: {} })),
    { post: post({ id: 'x', authorId: 'b', topics: ['music'] }), score: 1.5, parts: {} },
  ]
  const topicHistory = emptyHistory()
  const topics = [1, 2, 3].map(() => takeBest(topical, topicHistory)?.post.topics[0])
  assert.equal(topics[0], 'coffee', 'the best post still comes first')
  assert.ok(topics.includes('music'), `the run breaks within three picks: ${topics.join(' ')}`)
})

test('discovery picks are popular posts about topics that are new to the user', () => {
  const user = taste({ coffee: 10, gaming: -6 })
  assert.equal(isDiscovery(user, post({ topics: ['coffee'] })), false, 'a favorite needs no help')
  assert.equal(isDiscovery(user, post({ topics: ['gaming'] })), false, 'a topic they skip is left alone')
  assert.equal(isDiscovery(user, post({ topics: ['dance'] })), true)
  assert.equal(isDiscovery(user, post({ topics: [] })), false, 'a post without topics teaches nothing new')
})
