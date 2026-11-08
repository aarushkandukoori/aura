/**
 * Posts: what happens after the user posts (likes in waves, comments and replies, DMs, the group
 * chat, new followers, aura, maybe a big creator noticing), and the likes and comments that a
 * character's own new post gets.
 */
import type { Tier } from '../../shared/types.ts'
import { formatCount } from '../ai/prompts.ts'
import { castPostComments, reactToMyPost, type Line, type PlannedComment } from '../ai/tasks.ts'
import { TIERS } from '../config.ts'
import { getSetting, q } from '../db/index.ts'
import {
  addComment, addFollowers, addMemory, addPostLikes, addPostViews, bumpAura, followBack, getCast, getCastMember,
  getVisiblePostRow, likeComment, listConversations, postMedia, randomCrowdIds, setPostNote, showBanner,
  type CastMember, type PostRow,
} from '../repo/index.ts'
import { chance, pick, randomBetween, randomInt, sample } from '../repo/random.ts'
import { describePost, firstNameOf, imagesFor, isClose, postAudience, userInfo } from './context.ts'
import {
  AURA, auraFor, baseLikes, castPostLikes, commentTimes, CREATOR_NOTICE_CHANCE, followersFromLikes, inRange, LIKE_WAVES,
  replyLag, splitByShares, waveShares,
} from './curve.ts'
import { hasPending, schedule, updatePending } from './scheduler.ts'
import { simDelay } from './time.ts'

const currentTier = () => getSetting<Tier>('tier', 'popular')

/** How many strangers like a character's comment under one of my posts, by tier. */
const COMMENT_LIKES: Record<Tier, [number, number]> = { rising: [0, 3], popular: [1, 12], influencer: [12, 320], icon: [180, 4200] }
/** Only this many of those strangers like it by name (one broadcast each); the rest just raise the count. */
const NAMED_COMMENT_LIKERS = 6

/** Emoji-only comments are made from these, so even a hundred of them don't all look the same. */
const EMOJI_PIECES = ['🔥', '😍', '🙌', '❤️', '✨', '😭', '👏', '💯', '🥹', '💕', '🤩', '😮']
const EMOJI_WORDS = ['omg', 'wow', 'yesss', 'stunning', 'obsessed', 'love', 'iconic']

function emojiComment(): string {
  const emojis = pick(EMOJI_PIECES).repeat(randomInt(1, 3))
  return chance(0.25) ? `${pick(EMOJI_WORDS)} ${emojis}` : emojis
}

/** Replies under a post start with "@username", the way the apps write them. */
function withMention(text: string, username: string | undefined): string {
  return !username || text.startsWith('@') ? text : `@${username} ${text}`
}

/** Banner for a big moment, e.g. "✨ kenji.walks.tokyo liked your post". */
export function creatorBanner(creator: CastMember, action: string, href: string): void {
  showBanner({
    title: `✨ ${creator.username} ${action}`,
    body: `${creator.displayName} · ${formatCount(creator.followers)} followers`,
    avatar: creator.avatar,
    href,
  })
}

// ----- likes in waves ---------------------------------------------------------------------------

type WavePayload = {
  postId: string
  crowd: number
  named: string[]
  followers?: number
  views?: number
  /** Set by the AI's hype after the waves were planned: 1.2 means 20% more of everything. */
  scale?: number
}

/**
 * Plan a post's likes as waves on the engagement curve. Named characters are placed in the wave
 * they show up in; each wave also brings its share of new followers (my posts) and views (reels).
 */
function scheduleWaves(postId: string, likes: number, named: Map<number, string[]>, followers: number, viewsPerLike: number): void {
  const shares = waveShares(LIKE_WAVES)
  const likeParts = splitByShares(likes, shares)
  const followerParts = splitByShares(followers, shares)
  LIKE_WAVES.forEach((minute, index) => {
    const namedIds = named.get(index) ?? []
    const payload: WavePayload = {
      postId,
      crowd: Math.max(0, likeParts[index] - namedIds.length),
      named: namedIds,
      followers: followerParts[index],
      views: likeParts[index] * viewsPerLike,
    }
    schedule('post_wave', simDelay(minute), payload)
  })
}

/** Characters who like a post, each in the wave they show up in. */
function placeLikers(likers: { id: string; firstWave: number; lastWave: number }[]): Map<number, string[]> {
  const byWave = new Map<number, string[]>()
  for (const liker of likers) {
    const wave = randomInt(liker.firstWave, liker.lastWave)
    byWave.set(wave, [...(byWave.get(wave) ?? []), liker.id])
  }
  return byWave
}

/** Who likes a post of mine: every bestie and fan, most friends and mutuals. Besties are fastest. */
function likersOfMyPost(cast: CastMember[]): Map<number, string[]> {
  const likers = cast.flatMap((member) => {
    if (member.role === 'bestie') return [{ id: member.id, firstWave: 0, lastWave: 4 }]
    if (member.role === 'fan') return [{ id: member.id, firstWave: 0, lastWave: 8 }]
    if (member.role === 'friend' && chance(0.85)) return [{ id: member.id, firstWave: 1, lastWave: 11 }]
    if (member.role === 'mutual' && chance(0.7)) return [{ id: member.id, firstWave: 2, lastWave: 15 }]
    return []
  })
  return placeLikers(likers)
}

/** Job post_wave: one burst of likes (and views on reels), plus new followers and aura on my posts. */
export function likeWave({ postId, crowd, named, followers = 0, views = 0, scale = 1 }: WavePayload): void {
  const post = getVisiblePostRow(postId)
  if (!post) return
  const crowdLikes = Math.round(crowd * scale)
  if (views > 0) addPostViews(postId, views * scale)
  addPostLikes(postId, crowdLikes, named)
  if (post.author_id !== 'me') return
  const newFollowers = Math.round(followers * scale)
  if (newFollowers > 0) addFollowers([], newFollowers)
  bumpAura(auraFor({ likes: crowdLikes + named.length, followers: newFollowers }))
}

// ----- comments ---------------------------------------------------------------------------------

type CommentPayload = {
  postId: string
  authorId: string
  text: string
  /** For replies: the comment being answered (found by author and text when the job runs). */
  replyTo: { authorId: string; text: string } | null
  /** Emoji-only comments from strangers don't notify the user (there can be a hundred of them). */
  quiet?: boolean
}

/**
 * Schedule a post's comments: top-level ones front-loaded over about `span` sim minutes, each
 * reply 2-10 minutes after the comment it answers. Replies start with "@username".
 */
function scheduleComments(postId: string, comments: PlannedComment[], span = 90): void {
  const usernames = new Map(getCast().map((member) => [member.id, member.username]))
  // Final texts first, so a reply can name its parent by the exact text that will be posted.
  const texts = comments.map((comment) => {
    const parent = comment.replyTo >= 0 ? comments[comment.replyTo] : null
    return parent && parent.by !== comment.by ? withMention(comment.text, usernames.get(parent.by)) : comment.text
  })
  const times = commentTimes(comments.filter((comment) => comment.replyTo < 0).length, span)
  const minuteOf: number[] = []
  let nextTopLevel = 0
  comments.forEach((comment, index) => {
    const parentIndex = comment.replyTo
    minuteOf[index] = parentIndex < 0 ? times[nextTopLevel++] : (minuteOf[parentIndex] ?? randomBetween(2, span)) + replyLag()
    const payload: CommentPayload = {
      postId,
      authorId: comment.by,
      text: texts[index],
      replyTo: parentIndex >= 0 ? { authorId: comments[parentIndex].by, text: texts[parentIndex] } : null,
    }
    schedule('comment', simDelay(minuteOf[index]), payload)
  })
}

/** Strangers' comments (written or emoji-only), spread over the same front-loaded curve. */
function scheduleCrowdComments(postId: string, texts: string[], quiet = false): void {
  const authors = randomCrowdIds(texts.length, { followingMe: true })
  const times = commentTimes(texts.length)
  texts.forEach((text, index) => {
    const payload: CommentPayload = { postId, authorId: authors[index], text, replyTo: null, quiet }
    if (authors[index]) schedule('comment', simDelay(times[index]), payload)
  })
}

function findComment(postId: string, authorId: string, text: string): string | null {
  const row = q('SELECT id FROM comments WHERE post_id = ? AND author_id = ? AND text = ? ORDER BY created_at DESC LIMIT 1')
    .get(postId, authorId, text) as { id: string } | undefined
  return row?.id ?? null
}

/** Job comment: someone comments (or replies) on a post; then a few people like the comment. */
export function postComment({ postId, authorId, text, replyTo, quiet = false }: CommentPayload): void {
  const post = getVisiblePostRow(postId)
  if (!post) return
  const parentId = replyTo ? findComment(postId, replyTo.authorId, replyTo.text) : null
  if (replyTo && !parentId) return // the comment it answered was deleted
  if (findComment(postId, authorId, text)) return // already posted (the job ran before a restart)
  const comment = addComment({ postId, authorId, text, parentId, notify: !quiet })
  if (!comment) return

  const author = getCastMember(authorId)
  if (post.author_id === 'me') {
    bumpAura(AURA.perComment)
    if (author?.role === 'creator') creatorBanner(author, 'commented on your post', `/p/${postId}`)
  }
  scheduleCommentLikes(comment.id, post, author)
}

/** A few people like a new comment over the next minutes; on a character's post the author may heart it. */
function scheduleCommentLikes(commentId: string, post: PostRow, author: CastMember | null): void {
  // Under my posts the crowd grows with my tier; under a character's post it stays small.
  const range = post.author_id === 'me' ? COMMENT_LIKES[currentTier()] : COMMENT_LIKES.popular
  const crowd = author ? inRange(range) : chance(0.3) ? randomInt(1, 3) : 0
  // Named comment likes aren't stored, so nobody may like the same comment twice: the post's author only hearts it below.
  const others = getCast().filter((member) => isClose(member) && member.id !== author?.id && member.id !== post.author_id)
  const friends = author ? sample(others, randomInt(0, 2)) : []
  const strangers = randomCrowdIds(Math.min(crowd, NAMED_COMMENT_LIKERS))
  const likerIds = [...friends.map((member) => member.id), ...strangers]
  const payload: CommentLikesPayload = { commentId, likerIds, crowd: crowd - strangers.length }
  if (likerIds.length > 0) schedule('comment_likes', simDelay(randomBetween(1, 15)), payload)
  if (post.author_id !== 'me' && post.author_id !== author?.id && chance(0.4)) {
    schedule('comment_likes', simDelay(randomBetween(1, 20)), { commentId, likerIds: [post.author_id], byAuthor: true })
  }
}

type CommentLikesPayload = { commentId: string; likerIds: string[]; byAuthor?: boolean; crowd?: number }

/**
 * Job comment_likes: these people like a comment (byAuthor: it's the post author's heart). The
 * `crowd` strangers' likes are counted together with the first person's like.
 */
export function likeCommentBy({ commentId, likerIds, byAuthor = false, crowd = 0 }: CommentLikesPayload): void {
  likerIds.forEach((accountId, index) => likeComment(commentId, accountId, { byAuthor, crowd: index === 0 ? crowd : 0 }))
}

// ----- the user's post ----------------------------------------------------------------------------

/** The besties' group chat: the group whose members are all besties (onboarding makes one). */
function bestiesGroupId(): string | null {
  const group = listConversations().find((chat) =>
    chat.kind === 'group' && chat.members.length > 0 && chat.members.every((member) => member.role === 'bestie'))
  return group?.id ?? null
}

/** Job post_react: plan everything that happens to a new post of mine. */
export async function reactToNewPost({ postId }: { postId: string }): Promise<void> {
  const post = getVisiblePostRow(postId)
  const user = userInfo()
  if (!post || post.author_id !== 'me' || !user) return
  const tier = currentTier()
  const cast = getCast()

  // Likes start right away; the AI's hype later rescales the waves that haven't landed yet.
  // If the server restarted while the AI was writing, this job runs again: its waves are already planned.
  if (!hasPending('post_wave', 'postId', post.id)) {
    const likes = baseLikes(tier)
    scheduleWaves(post.id, likes, likersOfMyPost(cast), followersFromLikes(likes), post.kind === 'reel' ? randomInt(5, 12) : 0)
  }

  // A creator in the audience only takes part when they notice the post.
  const { audience, creator } = postAudience()
  const noticed = creator !== null && chance(CREATOR_NOTICE_CHANCE[tier])
  const reaction = await reactToMyPost({
    user,
    kind: post.kind,
    caption: post.caption,
    location: post.location,
    images: imagesFor(postMedia(post)),
    audience: noticed ? audience : audience.filter((member) => member.role !== 'creator'),
    castComments: inRange(TIERS[tier].castComments),
    crowdComments: inRange(TIERS[tier].crowdComments),
  })
  if (!getVisiblePostRow(postId)) return // deleted while the AI was writing

  if (reaction.description) setPostNote(post.id, reaction.description)
  if (reaction.fact) addMemory('*', reaction.fact)
  updatePending('post_wave', ['postId', post.id], ['scale', reaction.hype])

  scheduleComments(post.id, reaction.comments)
  scheduleCrowdComments(post.id, reaction.crowdComments)
  scheduleCrowdComments(post.id, Array.from({ length: inRange(TIERS[tier].emojiComments) }, emojiComment), true)

  for (const dm of reaction.dms) {
    const sharedPostId = chance(0.3) ? post.id : null
    schedule('cast_dm', simDelay(randomBetween(3, 30)), { accountId: dm.by, texts: dm.messages, sharedPostId })
  }
  const groupId = bestiesGroupId()
  if (groupId && reaction.groupLines.length > 0) {
    const lines: Line[] = reaction.groupLines
    schedule('group_lines', simDelay(randomBetween(5, 20)), { conversationId: groupId, lines, sharedPostId: chance(0.5) ? post.id : null })
  }
  if (noticed && creator) schedule('creator_notice', simDelay(randomBetween(5, 60)), { postId: post.id, creatorId: creator.id })
}

/** Job creator_notice: a big creator likes my post (and sometimes follows me). */
export function creatorNotice({ postId, creatorId }: { postId: string; creatorId: string }): void {
  const post = getVisiblePostRow(postId)
  const creator = getCastMember(creatorId)
  if (!post || !creator) return
  addPostLikes(postId, 0, [creatorId])
  creatorBanner(creator, 'liked your post', `/p/${postId}`)
  if (!creator.followsMe && chance(0.35)) followBack(creatorId)
}

// ----- a character's own post ---------------------------------------------------------------------

/** People who would comment on someone's post: mostly their own circle, plus a couple of others. */
function commentersFor(author: CastMember): CastMember[] {
  const others = getCast().filter((member) => member.id !== author.id)
  const sameCircle = others.filter((member) => isClose(member) === isClose(author))
  const rest = others.filter((member) => isClose(member) !== isClose(author))
  return [...sample(sameCircle, 3), ...sample(rest, 2)]
}

/** A character just posted: likes over the next hours, and a few comments from friends. */
export function planCastPost(postId: string): void {
  const post = getVisiblePostRow(postId)
  const author = post ? getCastMember(post.author_id) : null
  if (!post || !author) return
  const likers = sample(getCast().filter((member) => member.id !== author.id), randomInt(2, 6))
    .map((member) => ({ id: member.id, firstWave: 0, lastWave: 12 }))
  const likes = castPostLikes(author.followers, author.role === 'creator')
  scheduleWaves(post.id, likes, placeLikers(likers), 0, post.kind === 'reel' ? randomInt(5, 12) : 0)
  schedule('cast_post_comments', simDelay(randomBetween(0.5, 2)), { postId: post.id })
}

/** Job cast_post_comments: friends comment on a character's new post (AI, or templates). */
export async function commentOnCastPost({ postId }: { postId: string }): Promise<void> {
  const post = getVisiblePostRow(postId)
  const author = post ? getCastMember(post.author_id) : null
  const user = userInfo()
  if (!post || !author || !user) return
  const { comments } = await castPostComments({
    user,
    author,
    caption: post.caption,
    location: post.location,
    description: describePost(post),
    commenters: commentersFor(author),
    count: randomInt(2, 5),
  })
  scheduleComments(post.id, comments, 60)
  // Big creators also get a few quick comments from strangers.
  if (author.role === 'creator') scheduleCrowdComments(post.id, Array.from({ length: randomInt(1, 4) }, emojiComment))
}

/** Used in prompts: "Maya's post". */
export function postOwnerLabel(post: Pick<PostRow, 'author_id'>, userFirstName: string): string {
  if (post.author_id === 'me') return `${userFirstName}'s post`
  const author = getCastMember(post.author_id)
  return author ? `${firstNameOf(author.displayName)}'s post` : 'A post'
}
