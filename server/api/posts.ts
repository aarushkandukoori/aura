/**
 * Feed, explore, reels, hashtags and saved posts, plus everything you can do to a post:
 * create, delete, like, save, view, share and see who liked it.
 */
import { Router } from 'express'
import * as sim from '../sim/index.ts'
import {
  addPostView, countShare, createPost, deletePost, getAccountRow, getConversationRow, getExplore, getFeed, getLikers,
  getPost, getPostRow, getReels, getSaved, getTagPosts, getVisiblePostRow, sendMyMessage, setPostLike, setPostSave,
} from '../repo/index.ts'
import { badRequest, body, forbidden, idList, media, notFound, notifySim, nullableText, oneOf, queryText, text } from './http.ts'

export const postRoutes = Router()

postRoutes.get('/feed', (req, res) => {
  res.json(getFeed(queryText(req, 'cursor')))
})

postRoutes.get('/explore', (req, res) => {
  res.json(getExplore(queryText(req, 'cursor'), queryText(req, 'topic')))
})

postRoutes.get('/reels', (req, res) => {
  res.json(getReels(queryText(req, 'cursor'), queryText(req, 'start')))
})

postRoutes.get('/tags/:tag', (req, res) => {
  res.json(getTagPosts(req.params.tag, queryText(req, 'cursor')))
})

postRoutes.get('/saved', (req, res) => {
  res.json(getSaved(queryText(req, 'cursor')))
})

postRoutes.get('/posts/:id', (req, res) => {
  const post = getPost(req.params.id)
  if (!post) throw notFound('Post')
  res.json(post)
})

postRoutes.post('/posts', (req, res) => {
  const input = body(req)
  const kind = oneOf(input.kind, ['photo', 'carousel', 'reel'] as const, 'kind')
  if (!Array.isArray(input.media) || input.media.length === 0) throw badRequest('Add at least one photo or video')
  if (input.media.length > 10) throw badRequest('A post can have up to 10 photos or videos')
  const items = input.media.map((item: unknown, index: number) => media(item, `media[${index}]`))
  if (kind === 'reel' && items.length > 1 && items.some((item) => item.type === 'video')) throw badRequest('A reel is a single video')

  const taggedIds = input.taggedIds == null ? [] : idList(input.taggedIds, 'taggedIds', { min: 0, max: 20 })
  for (const id of taggedIds) {
    if (id === 'me' || !getAccountRow(id)) throw badRequest(`Can't tag ${id}`)
  }
  const post = createPost({
    // Photo vs carousel follows the number of items, whatever the client said.
    kind: kind === 'reel' ? 'reel' : items.length > 1 ? 'carousel' : 'photo',
    media: items,
    caption: text(input.caption ?? '', 'Caption', { max: 2200 }),
    location: nullableText(input.location, 'Location', 100),
    taggedIds,
  })
  notifySim(() => sim.onUserPost(post.id))
  res.json(post)
})

postRoutes.delete('/posts/:id', (req, res) => {
  const row = getPostRow(req.params.id)
  if (!row || (row.released !== 1 && row.author_id !== 'me')) throw notFound('Post')
  if (row.author_id !== 'me') throw forbidden('You can only delete your own posts')
  deletePost(row.id)
  res.json({ ok: true })
})

postRoutes.post('/posts/:id/like', (req, res) => {
  const wasLiked = getVisiblePostRow(req.params.id)?.liked_by_me === 1
  const result = setPostLike(req.params.id, true)
  if (!result) throw notFound('Post')
  if (!wasLiked) notifySim(() => sim.onUserLikedPost(req.params.id))
  res.json(result)
})

postRoutes.delete('/posts/:id/like', (req, res) => {
  const result = setPostLike(req.params.id, false)
  if (!result) throw notFound('Post')
  res.json(result)
})

postRoutes.post('/posts/:id/save', (req, res) => {
  const result = setPostSave(req.params.id, true)
  if (!result) throw notFound('Post')
  res.json(result)
})

postRoutes.delete('/posts/:id/save', (req, res) => {
  const result = setPostSave(req.params.id, false)
  if (!result) throw notFound('Post')
  res.json(result)
})

postRoutes.post('/posts/:id/view', (req, res) => {
  const result = addPostView(req.params.id)
  if (!result) throw notFound('Post')
  res.json(result)
})

/** Send a post into one or more chats (each gets a message with the post and the optional text). */
postRoutes.post('/posts/:id/share', (req, res) => {
  const post = getVisiblePostRow(req.params.id)
  if (!post) throw notFound('Post')
  const input = body(req)
  const conversationIds = idList(input.conversationIds, 'conversationIds', { min: 1, max: 20 })
  const note = nullableText(input.text, 'Message', 1000) ?? ''
  for (const id of conversationIds) {
    if (!getConversationRow(id)) throw notFound('Conversation')
  }
  for (const conversationId of conversationIds) {
    const message = sendMyMessage({ conversationId, text: note, sharedPostId: post.id })
    if (message) notifySim(() => sim.onUserMessage(conversationId, message.id))
  }
  countShare(post.id)
  res.json({ ok: true })
})

postRoutes.get('/posts/:id/likes', (req, res) => {
  const likes = getLikers(req.params.id)
  if (!likes) throw notFound('Post')
  res.json(likes)
})
