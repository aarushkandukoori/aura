/**
 * The catalog: every post the algorithm can recommend, with what it needs to score it (who posted
 * it, what it is about, how popular it is, how old it is), loaded in one query per page.
 */
import { parseJson, q } from '../db/index.ts'
import type { PostRow, StoryRow } from '../repo/rows.ts'
import { loadContent } from '../seed/content.ts'
import { HOUR_MS } from './decay.ts'
import { libraryTopicsFor, topicsOfPostText, topicsOfText } from './topics.ts'

/** One post, as the scoring functions see it. */
export interface Candidate {
  id: string
  authorId: string
  /** Posted by the user. */
  mine: boolean
  /** The user follows the author. */
  followed: boolean
  /** 0..1: how close the author is to the user (bestie 0.9 ... creator 0.1; strangers 0). */
  closeness: number
  kind: 'photo' | 'carousel' | 'reel'
  /** What it is about, strongest first (at most 3). */
  topics: string[]
  likes: number
  comments: number
  views: number
  shares: number
  likedByMe: boolean
  savedByMe: boolean
  createdAt: number
  ageHours: number
  /** The post's own words: caption plus what the picture shows (for free-form topic pages). */
  text: string
}

/** What the catalog knows about a character: their usual look (to ignore in picture notes) and interests. */
export interface AuthorInfo {
  look: string
  interests: string[]
}

type CatalogRow = Pick<PostRow, 'id' | 'author_id' | 'kind' | 'caption' | 'location' | 'ai_note' | 'source_id' | 'like_count'
  | 'comment_count' | 'view_count' | 'share_count' | 'liked_by_me' | 'saved_by_me' | 'created_at'>
  & { i_follow: number; closeness: number }

/** Every character's look and interests, by id (32 small JSON objects: cheap to read per page). */
export function loadAuthors(): Map<string, AuthorInfo> {
  const rows = q("SELECT id, persona FROM accounts WHERE kind = 'cast'").all() as { id: string; persona: string | null }[]
  return new Map(rows.map((row) => {
    const persona = parseJson<{ look?: string; interests?: string[] }>(row.persona, {})
    return [row.id, { look: persona.look ?? '', interests: persona.interests ?? [] }]
  }))
}

/** Released posts (or only reels) with their authors, as candidates. */
export function loadCandidates(options: { reelsOnly?: boolean; now: number; authors?: Map<string, AuthorInfo> }): Candidate[] {
  const rows = q(`
    SELECT p.id, p.author_id, p.kind, p.caption, p.location, p.ai_note, p.source_id, p.like_count, p.comment_count,
      p.view_count, p.share_count, p.liked_by_me, p.saved_by_me, p.created_at, a.i_follow, a.closeness
    FROM posts p JOIN accounts a ON a.id = p.author_id
    WHERE p.released = 1 AND (? = 0 OR p.kind = 'reel')`).all(options.reelsOnly ? 1 : 0) as CatalogRow[]
  const authors = options.authors ?? loadAuthors()
  return rows.map((row) => {
    const look = authors.get(row.author_id)?.look ?? ''
    return {
      id: row.id,
      authorId: row.author_id,
      mine: row.author_id === 'me',
      followed: row.i_follow === 1,
      closeness: row.closeness,
      kind: row.kind,
      topics: postTopics(row, look),
      likes: row.like_count,
      comments: row.comment_count,
      views: row.view_count,
      shares: row.share_count,
      likedByMe: row.liked_by_me === 1,
      savedByMe: row.saved_by_me === 1,
      createdAt: row.created_at,
      ageHours: Math.max(0, (options.now - row.created_at) / HOUR_MS),
      text: `${row.caption} ${withoutLook(row.ai_note, look)}`,
    }
  })
}

/** Library picture prompts start with the author's usual look, which says nothing about the post. */
function withoutLook(note: string | null, look: string): string {
  return look ? (note ?? '').split(look).join(' ') : note ?? ''
}

// ----- topics of posts and stories, cached ----------------------------------------------------

/**
 * Topics never change unless the caption or the picture note does, so they are worked out once per
 * post and remembered (the key includes both lengths, so a new picture note is noticed).
 */
const topicCache = new Map<string, string[]>()
const CACHE_LIMIT = 50_000

type TopicSource = Pick<PostRow, 'id' | 'caption' | 'location' | 'ai_note' | 'source_id'>

/** What a post is about: its AI-checked topics for library posts (content/topics.json), otherwise keyword rules. */
export function postTopics(row: TopicSource, look: string): string[] {
  const key = `${row.id}:${row.caption.length}:${row.ai_note?.length ?? 0}`
  let topics = topicCache.get(key)
  if (!topics) {
    if (topicCache.size >= CACHE_LIMIT) topicCache.clear()
    const checked = libraryTopicsFor(row.source_id)
    topics = checked.length > 0 ? checked : topicsOfPostText({ caption: row.caption, location: row.location, note: row.ai_note }, look)
    topicCache.set(key, topics)
  }
  return topics
}

/** Topics of one post by id (any post, released or not), or [] when it doesn't exist. */
export function topicsOfPostId(postId: string): string[] {
  const row = q(`
    SELECT p.id, p.caption, p.location, p.ai_note, p.source_id, a.persona
    FROM posts p JOIN accounts a ON a.id = p.author_id WHERE p.id = ?`).get(postId) as (TopicSource & { persona: string | null }) | undefined
  if (!row) return []
  return postTopics(row, parseJson<{ look?: string }>(row.persona, {}).look ?? '')
}

/** What a character's story shows: AI-checked topics, else keywords from its picture prompt and text. */
export function storyTopics(row: Pick<StoryRow, 'author_id' | 'source_id' | 'overlay'>): string[] {
  const fromFile = libraryTopicsFor(row.source_id)
  if (fromFile.length > 0) return fromFile
  const persona = loadContent().cast.find((person) => person.id === row.author_id)
  const story = persona?.stories.find((item) => item.id === row.source_id)
  const overlay = parseJson<{ text?: string | null } | null>(row.overlay, null)
  return topicsOfText(`${overlay?.text ?? ''} ${withoutLook(story?.image.prompt ?? null, persona?.look ?? '')}`)
}

/** The topics an account posts about most, strongest first (from their released posts). */
export function accountTopics(candidates: Candidate[]): Map<string, string[]> {
  const counts = new Map<string, Map<string, number>>()
  for (const post of candidates) {
    const byTopic = counts.get(post.authorId) ?? new Map<string, number>()
    post.topics.forEach((topic, index) => byTopic.set(topic, (byTopic.get(topic) ?? 0) + (index === 0 ? 1 : 0.5)))
    counts.set(post.authorId, byTopic)
  }
  const top = new Map<string, string[]>()
  for (const [authorId, byTopic] of counts) {
    top.set(authorId, [...byTopic].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([topic]) => topic))
  }
  return top
}
