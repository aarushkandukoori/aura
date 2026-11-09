/**
 * API tests: boot the real app on a random port with its own temporary database and walk through
 * the main flows the way an app would. The simulation is not started, so the tests call world
 * actions from server/repo directly where a character would normally act. Run with `npm test`.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import type {
  Account, Badges, Comment, Conversation, ConversationsResponse, LikeResponse, LiveEvent, Message, Notification, Page,
  Post, Profile, SearchResult, Session, Story, StoryReplyResponse, StoryTray, UploadResponse, ViewersResponse,
} from '../shared/types.ts'

// Configuration is read when modules load, so set it before importing the app. These tests run
// in local mode (no sign-in, one world), even if .env sets up Google sign-in.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-test-'))
process.env.AURA_DATA_DIR = dataDir
process.env.AURA_PROVIDER = 'offline'
delete process.env.GOOGLE_CLIENT_ID
delete process.env.GOOGLE_CLIENT_SECRET
delete process.env.AURA_DEV_LOGIN

const { createApp } = await import('./app.ts')
const { TIERS } = await import('./config.ts')
const { closeAllWorlds } = await import('./db/index.ts')
const repo = await import('./repo/index.ts')
const { loadContent } = await import('./seed/content.ts')
const sim = await import('./sim/index.ts')

let server: Server
let base = ''

before(async () => {
  server = createApp().listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

after(() => {
  sim.stop()
  server.closeAllConnections()
  server.close()
  closeAllWorlds()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

/** Call the API and return status + parsed JSON body. */
async function call(method: string, route: string, body?: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${base}/api${route}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

/** Call the API and expect success. */
async function api<T>(method: string, route: string, body?: unknown): Promise<T> {
  const { status, body: data } = await call(method, route, body)
  assert.ok(status < 300, `${method} ${route} answered ${status}: ${JSON.stringify(data)}`)
  return data as T
}

/** A 1x1 PNG, the smallest real image. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

const ONBOARDING = {
  displayName: 'Sam Rivera',
  username: 'sam.rivera',
  avatar: null,
  bio: 'coffee first',
  pronouns: 'they/them',
  interests: ['music', 'food', 'travel'],
  tier: 'popular',
  origin: 'college',
}

let myPost: Post
let castPost: Post

test('session works before onboarding, other routes wait for it', async () => {
  const session = await api<Session>('GET', '/session')
  assert.equal(session.onboarded, false)
  assert.equal(session.me, null)
  assert.deepEqual(session.badges, { notifications: 0, messages: 0 })
  // Local mode: no sign-in, so no account, and the sign-in routes are switched off.
  assert.equal(session.authEnabled, false)
  assert.equal(session.account, null)
  assert.equal((await fetch(`${base}/auth/dev`, { method: 'POST' })).status, 404)

  const feed = await call('GET', '/feed')
  assert.equal(feed.status, 409)
  assert.ok(typeof (feed.body as { error: string }).error === 'string')

  const tooShort = await call('POST', '/onboarding', { ...ONBOARDING, username: 'x' })
  assert.equal(tooShort.status, 400)
  const taken = await call('POST', '/onboarding', { ...ONBOARDING, username: loadContent().cast[0].username })
  assert.deepEqual(taken, { status: 400, body: { error: 'That username is taken' } })
  // A profile called "explore" could never be opened: /explore is a page.
  const appPage = await call('POST', '/onboarding', { ...ONBOARDING, username: 'explore' })
  assert.equal(appPage.status, 400)
})

test('onboarding builds the world', async () => {
  const session = await api<Session>('POST', '/onboarding', ONBOARDING)
  assert.equal(session.onboarded, true)
  assert.equal(session.me?.username, 'sam.rivera')
  assert.equal(session.me?.followers, TIERS.popular.followers)
  assert.ok((session.me?.following ?? 0) > 20, 'follows the cast')
  assert.equal(session.badges.notifications, 1, 'the first "started following you" notification')

  const again = await call('POST', '/onboarding', ONBOARDING)
  assert.equal(again.status, 409)

  const inbox = await api<ConversationsResponse>('GET', '/conversations')
  assert.ok(inbox.conversations.some((conversation) => conversation.title === 'the besties 💌'))
})

test('the ranked feed pages through followed posts with a suggested post after every 4', async () => {
  const posts: Post[] = []
  let cursor: string | null = null
  do {
    const page: Page<Post> = await api<Page<Post>>('GET', `/feed${cursor ? `?cursor=${cursor}` : ''}`)
    assert.ok(page.items.length <= 10)
    posts.push(...page.items)
    cursor = page.nextCursor
  } while (cursor)

  assert.equal(new Set(posts.map((post) => post.id)).size, posts.length, 'no duplicates across pages')
  const followed = posts.filter((post) => !post.suggested)
  const suggested = posts.filter((post) => post.suggested)
  assert.ok(suggested.length > 0, 'has suggested posts')
  assert.ok(suggested.every((post) => !post.author.iFollow), 'suggestions come from accounts I do not follow')
  // The order is ranked per user (server/recs, tested in server/recs/*.test.ts), not newest first.
  assert.equal(posts.findIndex((post) => post.suggested), 4, 'first suggestion comes after 4 followed posts')
  const lastFollowed = posts.findLastIndex((post) => !post.suggested)
  assert.ok(posts.slice(0, lastFollowed).every((post, i) => !post.suggested || !posts[i + 1].suggested), 'never two suggestions in a row before the followed posts run out')
  assert.ok(suggested.every((post) => typeof post.reason === 'string' && post.reason !== ''), 'suggested posts say why')
  castPost = followed.find((post) => post.author.kind === 'cast' && post.kind !== 'reel') as Post
})

test('upload an image and post it', async () => {
  const res = await fetch(`${base}/api/upload`, {
    method: 'POST',
    headers: { 'content-type': 'image/png', 'x-width': '1080', 'x-height': '1350' },
    body: PNG,
  })
  const upload = (await res.json()) as UploadResponse
  assert.equal(res.status, 200)
  assert.match(upload.url, /^\/media\/uploads\/.+\.png$/, 'local mode keeps the original upload URLs')
  assert.ok(fs.existsSync(path.join(dataDir, 'uploads', upload.url.split('/').pop() as string)), 'saved in <dataDir>/uploads')
  assert.deepEqual([upload.type, upload.width, upload.height], ['image', 1080, 1350])
  assert.equal((await fetch(base + upload.url)).status, 200, 'the upload is served')

  const badType = await fetch(`${base}/api/upload`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hi' })
  assert.equal(badType.status, 415)

  myPost = await api<Post>('POST', '/posts', {
    kind: 'photo',
    media: [{ url: upload.url, type: 'image', width: 1080, height: 1350 }],
    caption: 'sunday reset #goldenhour',
    location: 'Brooklyn',
  })
  assert.equal(myPost.author.kind, 'me')
  const feed = await api<Page<Post>>('GET', '/feed')
  assert.equal(feed.items[0].id, myPost.id, 'my post is first in the feed')
  const session = await api<Session>('GET', '/session')
  assert.equal(session.me?.postCount, 1)

  const bad = await call('POST', '/posts', { kind: 'photo', media: [{ url: 'https://example.com/x.jpg', type: 'image' }] })
  assert.equal(bad.status, 400)
})

test('liking and unliking update the counts', async () => {
  const before = castPost.likeCount
  const liked = await api<LikeResponse>('POST', `/posts/${castPost.id}/like`)
  assert.deepEqual(liked, { likeCount: before + 1, likedByMe: true })
  const again = await api<LikeResponse>('POST', `/posts/${castPost.id}/like`)
  assert.equal(again.likeCount, before + 1, 'liking twice counts once')
  const unliked = await api<LikeResponse>('DELETE', `/posts/${castPost.id}/like`)
  assert.deepEqual(unliked, { likeCount: before, likedByMe: false })
})

test('comments, replies and the notifications they create for me', async () => {
  const mine = await api<Comment>('POST', `/posts/${castPost.id}/comments`, { text: 'this is so good' })
  assert.equal(mine.author.kind, 'me')
  const thread = await api<Comment[]>('GET', `/posts/${castPost.id}/comments`)
  assert.equal(thread[0].id, mine.id, 'my comment is listed first')

  const castComment = thread.find((comment) => comment.author.kind !== 'me') as Comment
  const reply = await api<Comment>('POST', `/posts/${castPost.id}/comments`, { text: 'agreed', parentId: castComment.id })
  assert.equal(reply.parentId, castComment.id)
  const replyToReply = await api<Comment>('POST', `/posts/${castPost.id}/comments`, { text: 'ha', parentId: reply.id })
  assert.equal(replyToReply.parentId, castComment.id, 'replies to replies join the top-level thread')

  // Characters react to my post and my comment (the simulation would do this).
  const castOnMyPost = repo.addComment({ postId: myPost.id, authorId: 'maya', text: 'the light!!' }) as Comment
  const myReply = await api<Comment>('POST', `/posts/${myPost.id}/comments`, { text: 'thank you', parentId: castOnMyPost.id })
  repo.addComment({ postId: myPost.id, authorId: 'diego', text: 'lol', parentId: myReply.id })

  // Characters talking among themselves under my post, and emoji comments from strangers, don't notify me.
  repo.addComment({ postId: myPost.id, authorId: 'jules', text: 'same', parentId: castOnMyPost.id })
  repo.addComment({ postId: myPost.id, authorId: 'priya', text: '🔥🔥', notify: false })

  const notifications = await api<Page<Notification>>('GET', '/notifications')
  const kinds = notifications.items.map((notification) => `${notification.kind}:${notification.actor?.id}`)
  assert.ok(kinds.includes('comment:maya'))
  assert.ok(kinds.includes('reply:diego'))
  assert.ok(!kinds.includes('comment:jules') && !kinds.includes('comment:priya'))
  const myThread = await api<Comment[]>('GET', `/posts/${myPost.id}/comments`)
  assert.equal(myThread[0].replies.length, 3)

  const badges = await api<Badges>('POST', '/notifications/read')
  assert.equal(badges.notifications, 0)
})

test('stories: post one, see viewers, reply to a friend in DMs', async () => {
  const story = await api<Story>('POST', '/stories', {
    media: { url: myPost.media[0].url, type: 'image' },
    overlay: { text: 'hi', color: '#ffffff', y: 0.3 },
  })
  const trays = await api<StoryTray[]>('GET', '/stories')
  assert.equal(trays[0].author.kind, 'me', 'my tray comes first')

  repo.addStoryViews(story.id, ['maya', 'diego'], 50)
  repo.reactToStory(story.id, 'priya', '😍')
  const viewers = await api<ViewersResponse>('GET', `/stories/${story.id}/viewers`)
  assert.equal(viewers.total, 53)
  assert.ok(viewers.viewers.some((viewer) => viewer.account.id === 'priya' && viewer.reaction === '😍'))

  const castTray = trays.find((tray) => tray.author.kind === 'cast') as StoryTray
  const notMine = await call('GET', `/stories/${castTray.stories[0].id}/viewers`)
  assert.equal(notMine.status, 403)

  const { conversationId } = await api<StoryReplyResponse>('POST', `/stories/${castTray.stories[0].id}/reply`, { text: 'where is this??' })
  const messages = await api<Page<Message>>('GET', `/conversations/${conversationId}/messages`)
  assert.equal(messages.items.at(-1)?.text, 'where is this??')
  assert.equal(messages.items.at(-1)?.story?.id, castTray.stories[0].id)
  const dm = await api<Conversation>('GET', `/conversations/${conversationId}`)
  assert.deepEqual(dm.members.map((member) => member.id), [castTray.author.id])

  // A character answering MY story shows that story's picture above their message.
  const mayaDm = repo.getOrCreateDm('maya') as Conversation
  const castReply = repo.sendCastMessage({ conversationId: mayaDm.id, senderId: 'maya', text: 'obsessed', storyId: story.id })
  assert.equal(castReply?.story?.id, story.id)
  assert.equal(castReply?.story?.thumb, myPost.media[0].url)
})

test('follow and unfollow', async () => {
  const [suggestion] = await api<Account[]>('GET', '/suggestions')
  const before = (await api<Session>('GET', '/session')).me?.following ?? 0
  const followed = await api<Account>('POST', `/accounts/${suggestion.id}/follow`)
  assert.equal(followed.iFollow, true)
  assert.equal((await api<Session>('GET', '/session')).me?.following, before + 1)
  const unfollowed = await api<Account>('DELETE', `/accounts/${suggestion.id}/follow`)
  assert.equal(unfollowed.iFollow, false)
  const profile = await api<Profile>('GET', `/accounts/${suggestion.username}`)
  assert.equal(profile.iFollow, false)
  assert.equal(profile.isMe, false)
})

test('search finds people and hashtags', async () => {
  const maya = repo.getCastMember('maya')
  assert.ok(maya)
  const people = await api<SearchResult>('GET', `/search?q=${encodeURIComponent(maya.username.slice(0, 5))}`)
  assert.equal(people.accounts[0].id, 'maya', 'cast come before the crowd')

  const tags = await api<SearchResult>('GET', '/search?q=%23golden')
  assert.ok(tags.tags.some((tag) => tag.tag === 'goldenhour'))
  const tagged = await api<Page<Post>>('GET', '/tags/goldenhour')
  assert.ok(tagged.items.some((post) => post.id === myPost.id))
})

test('conversations: DM reuse, groups, sending and reading', async () => {
  const dm = await api<Conversation>('POST', '/conversations', { memberIds: ['maya'] })
  const sameDm = await api<Conversation>('POST', '/conversations', { memberIds: ['maya'] })
  assert.equal(sameDm.id, dm.id, 'an existing DM is reused')

  const group = await api<Conversation>('POST', '/conversations', { memberIds: ['diego', 'priya'] })
  assert.equal(group.kind, 'group')
  assert.equal(group.title, 'Diego, Priya')

  const sent = await api<Message>('POST', `/conversations/${group.id}/messages`, { text: 'dinner friday?' })
  assert.equal(sent.sender.kind, 'me')

  // Diego answers (the simulation would do this): one unread conversation.
  repo.sendCastMessage({ conversationId: group.id, senderId: 'diego', text: 'im in' })
  const inbox = await api<ConversationsResponse>('GET', '/conversations')
  assert.equal(inbox.conversations[0].id, group.id, 'newest activity first')
  assert.equal(inbox.conversations[0].unread, 1)
  const before = await api<Badges>('GET', '/badges')
  assert.ok(before.messages >= 1)

  const after = await api<Badges>('POST', `/conversations/${group.id}/read`)
  assert.equal(after.messages, before.messages - 1)
  assert.equal((await api<Conversation>('GET', `/conversations/${group.id}`)).unread, 0)

  const page = await api<Page<Message>>('GET', `/conversations/${group.id}/messages`)
  assert.deepEqual(page.items.map((message) => message.text), ['dinner friday?', 'im in'])
})

test('the live stream sends post.stats after a like', { timeout: 5000 }, async () => {
  const controller = new AbortController()
  const res = await fetch(`${base}/api/live`, { signal: controller.signal })
  assert.ok(res.body)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  /** The next `data:` event on the stream (SSE frames end with a blank line). */
  async function nextEvent(): Promise<LiveEvent> {
    while (!buffer.includes('\n\n')) {
      const { value, done } = await reader.read()
      if (done) throw new Error('the stream ended')
      buffer += decoder.decode(value, { stream: true })
    }
    const end = buffer.indexOf('\n\n')
    const frame = buffer.slice(0, end)
    buffer = buffer.slice(end + 2)
    const data = frame.split('\n').find((line) => line.startsWith('data: '))
    return data ? (JSON.parse(data.slice(6)) as LiveEvent) : nextEvent() // skip "retry:" and ping frames
  }

  async function waitFor(match: (event: LiveEvent) => boolean): Promise<LiveEvent> {
    for (;;) {
      const event = await nextEvent()
      if (match(event)) return event
    }
  }

  const hello = await waitFor(() => true)
  assert.equal(hello.type, 'hello', 'the first event is hello')
  const liked = await api<LikeResponse>('POST', `/posts/${castPost.id}/like`)
  const stats = await waitFor((event) => event.type === 'post.stats' && event.postId === castPost.id)
  assert.ok(stats.type === 'post.stats')
  assert.equal(stats.likeCount, liked.likeCount)
  controller.abort()
})

test('errors come back as JSON with a status', async () => {
  const missing = await call('GET', '/posts/p_doesnotexist')
  assert.equal(missing.status, 404)
  assert.deepEqual(missing.body, { error: 'Post not found' })
  const forbidden = await call('DELETE', `/posts/${castPost.id}`)
  assert.equal(forbidden.status, 403)
  // A missing library image says "Not found", never the file's path on this Mac.
  const image = await fetch(`${base}/content/images/nobody/nothing.webp`)
  assert.deepEqual([image.status, await image.json()], [404, { error: 'Not found' }])
})

test('other websites cannot change anything', async () => {
  const forged = await fetch(`${base}/api/notifications/read`, { method: 'POST', headers: { origin: 'https://evil.example' } })
  assert.equal(forged.status, 403)
  const ours = await fetch(`${base}/api/notifications/read`, { method: 'POST', headers: { origin: base } })
  assert.equal(ours.status, 200)
})

test('hand-made cursors and media that do not fit are refused politely', async () => {
  const cursor = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  for (const bad of [{ followed: 1 }, { suggested: true }, { followed: { t: {}, id: [] } }]) {
    assert.equal((await call('GET', `/feed?cursor=${cursor(bad)}`)).status, 200)
  }
  for (const bad of [{ start: true }, { start: {} }, { start: ['a'] }]) {
    assert.equal((await call('GET', `/reels?cursor=${cursor(bad)}`)).status, 200)
  }
  const notAnImage = await call('PATCH', '/me', { avatar: '/content/cast.json' })
  assert.equal(notAnImage.status, 400)
  const notAVideo = await call('POST', '/posts', { kind: 'reel', media: [{ url: myPost.media[0].url, type: 'video' }] })
  assert.equal(notAVideo.status, 400)
})
