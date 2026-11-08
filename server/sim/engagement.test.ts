/**
 * Engagement tests (no AI): the like curve, comment timing, speed scaling, the offline writing
 * rules (characters' voices, no repeated lines, crisis replies that point to 988), and a full
 * plan for a new post in a real seeded world. Uses its own temporary database.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-sim-engagement-'))
process.env.AURA_DATA_DIR = dataDir
process.env.AURA_PROVIDER = 'offline'

const { db, q, setSetting } = await import('../db/index.ts')
const { TIERS } = await import('../config.ts')
const repo = await import('../repo/index.ts')
const { buildWorld } = await import('../seed/world.ts')
const curve = await import('./curve.ts')
const time = await import('./time.ts')
const offline = await import('../ai/offline.ts')
const { inVoice, sameLineKey } = await import('./voice.ts')
const { reactToNewPost, likeWave } = await import('./posts.ts')
const { userInfo } = await import('./context.ts')

before(() => {
  buildWorld({
    displayName: 'Sam Rivera', username: 'sam.rivera', avatar: null, bio: 'coffee first', pronouns: 'they/them',
    interests: ['photography', 'coffee', 'travel'], tier: 'popular', origin: 'college',
  })
})

after(() => {
  db.close()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

const castMember = (id: string) => {
  const member = repo.getCastMember(id)
  assert.ok(member, `cast member ${id} exists in content/cast.json`)
  return member
}

// ----- the curve ------------------------------------------------------------------------------

test('like waves follow 1 - e^(-t/25): shares add up to 1 and most likes come early', () => {
  const shares = curve.waveShares(curve.LIKE_WAVES)
  assert.ok(Math.abs(shares.reduce((sum, share) => sum + share, 0) - 1) < 1e-9)
  assert.ok(shares.every((share) => share > 0))
  const byTwenty = shares.slice(0, curve.LIKE_WAVES.indexOf(20) + 1).reduce((sum, share) => sum + share, 0)
  assert.ok(byTwenty > 0.5, `over half within 20 sim minutes (${byTwenty.toFixed(2)})`)
  assert.ok(shares.at(-1)! < 0.01, 'a thin tail at the end')
})

test('splitting a total into waves keeps every like', () => {
  const shares = curve.waveShares(curve.LIKE_WAVES)
  for (const total of [0, 1, 7, 2_400, 6_499, 1_199_999]) {
    const parts = curve.splitByShares(total, shares)
    assert.equal(parts.reduce((sum, part) => sum + part, 0), total)
    assert.ok(parts.every((part) => part >= 0 && Number.isInteger(part)))
  }
})

test('comments are front-loaded over ~90 sim minutes, the first within 0.5-2', () => {
  for (let run = 0; run < 50; run++) {
    const times = curve.commentTimes(12)
    assert.ok(times[0] >= 0.5 && times[0] <= 2)
    assert.ok(times.every((minute, index) => index === 0 || minute >= times[index - 1]), 'oldest first')
    assert.ok(times.at(-1)! <= 99)
    assert.ok(times[6] < 45, 'the middle comment lands in the first half')
  }
})

test('follower gains and aura stay in their ranges', () => {
  for (let run = 0; run < 50; run++) {
    const followers = curve.followersFromLikes(10_000)
    assert.ok(followers >= 100 && followers <= 300)
    const likes = curve.baseLikes('popular')
    assert.ok(likes >= TIERS.popular.likes[0] && likes <= TIERS.popular.likes[1])
  }
  assert.equal(curve.auraFor({ likes: 100, comments: 2, followers: 5 }), 20 + 12 + 5)
})

// ----- time -----------------------------------------------------------------------------------

test('sim minutes shrink with the speed setting; chats use short real delays', () => {
  setSetting('speed', 'fast')
  assert.equal(time.simDelay(10), 10 * 60_000 * 0.08)
  for (let run = 0; run < 30; run++) {
    const seen = time.seenDelay()
    assert.ok(seen >= 2_000 && seen <= 12_000)
    assert.ok(time.typingTime('x'.repeat(500)) <= 5_000 * 1.15 + 1)
  }
  setSetting('speed', 'instant')
  assert.equal(time.simDelay(10), 10 * 60_000 * 0.015)
  for (let run = 0; run < 30; run++) assert.ok(time.seenDelay() <= 4_001, 'instant chats run at a third')
})

// ----- offline writing ------------------------------------------------------------------------

test('offline voices follow each persona: caps, lowercase, flat periods', () => {
  assert.match(inVoice('no because the sunset @maya', castMember('diego')), /^NO BECAUSE THE SUNSET @maya/)
  assert.match(inVoice('This is good', castMember('jules')), /^this is good\./)
  assert.doesNotMatch(inVoice('Wait, what?', castMember('maya')), /[,?]/)
})

test('an offline post plan never repeats a line and replies point at earlier comments', () => {
  const user = userInfo()
  assert.ok(user)
  const cast = repo.getCast()
  for (let run = 0; run < 20; run++) {
    const plan = offline.reactToMyPost({
      user, kind: 'photo', caption: 'sunday reset at the lake #goldenhour', location: 'Lake Michigan', images: [],
      audience: cast.slice(0, 14), castComments: 12, crowdComments: 7,
    })
    const keys = [...plan.comments.map((comment) => comment.text), ...plan.crowdComments].map(sameLineKey)
    assert.equal(new Set(keys).size, keys.length, `no repeats: ${keys.join(' | ')}`)
    assert.ok(plan.comments.length >= 10)
    assert.ok(plan.comments.every((comment, index) => comment.replyTo < index))
    assert.ok(plan.dms.length >= 1 && plan.groupLines.length >= 2)
  }
})

test('every character answers a crisis message with care and 988, online or not', () => {
  const user = userInfo()
  assert.ok(user)
  const history = [{ id: 'm1', senderId: 'me', name: 'Sam', text: "honestly i don't want to be here anymore", note: null }]
  for (const character of repo.getCast()) {
    const reply = offline.dmReply({ user, character, memories: [], history, images: [] })
    assert.ok(reply.messages.some((message) => message.includes('988')), `${character.id}: ${reply.messages.join(' / ')}`)
    assert.equal(reply.react, '')
  }
})

// ----- a full plan in a seeded world ----------------------------------------------------------

test("a new post gets 26 like waves, comments, DMs and a group chat line, and the waves add up", async () => {
  setSetting('speed', 'fast')
  const post = repo.createPost({
    kind: 'photo', caption: 'golden hour at the lake', location: 'Chicago', taggedIds: [],
    media: [{ url: '/content/images/priya/p8.webp', type: 'image', width: 768, height: 960 }],
  })
  const followersBefore = repo.getMeRow()!.followers
  await reactToNewPost({ postId: post.id })

  const jobs = (kind: string) => (q("SELECT payload FROM jobs WHERE kind = ? AND state = 'pending'").all(kind) as { payload: string }[])
    .map((row) => JSON.parse(row.payload))
  const waves = jobs('post_wave').filter((wave) => wave.postId === post.id)
  assert.equal(waves.length, curve.LIKE_WAVES.length)
  const scale = waves[0].scale
  assert.ok(scale >= 0.8 && scale <= 1.3, 'the hype was applied to every waiting wave')
  const planned = waves.reduce((sum, wave) => sum + wave.crowd + wave.named.length, 0)
  assert.ok(planned >= TIERS.popular.likes[0] && planned <= TIERS.popular.likes[1])
  assert.ok(waves.slice(0, 5).flatMap((wave) => wave.named).includes('maya'), 'besties like it in the first waves')

  const comments = jobs('comment').filter((comment) => comment.postId === post.id)
  const [castMin] = TIERS.popular.castComments
  assert.ok(comments.length >= castMin + TIERS.popular.crowdComments[0] + TIERS.popular.emojiComments[0])
  const texts = new Set(comments.map((comment) => comment.text))
  for (const comment of comments) if (comment.replyTo) assert.ok(texts.has(comment.replyTo.text), 'a reply names a planned comment')
  assert.ok(jobs('cast_dm').length >= 1)
  assert.equal(jobs('group_lines').length, 1)

  for (const wave of waves) likeWave(wave)
  const liked = repo.getPostRow(post.id)!.like_count
  assert.ok(Math.abs(liked - planned * scale) <= curve.LIKE_WAVES.length, `${liked} likes ≈ ${Math.round(planned * scale)}`)
  assert.ok(repo.getMeRow()!.followers > followersBefore, 'the post brought new followers')
})
