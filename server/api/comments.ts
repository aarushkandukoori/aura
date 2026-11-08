/**
 * Comments: reading a post's threads, commenting and replying, hearts, pins and deleting.
 */
import { Router } from 'express'
import * as sim from '../sim/index.ts'
import {
  addComment, canDeleteComment, deleteComment, getCommentRow, getComments, getPostRow, getVisiblePostRow,
  setMyCommentLike, togglePin,
} from '../repo/index.ts'
import { badRequest, body, forbidden, notFound, notifySim, text } from './http.ts'

export const commentRoutes = Router()

commentRoutes.get('/posts/:id/comments', (req, res) => {
  if (!getVisiblePostRow(req.params.id)) throw notFound('Post')
  res.json(getComments(req.params.id))
})

commentRoutes.post('/posts/:id/comments', (req, res) => {
  const postId = req.params.id
  if (!getVisiblePostRow(postId)) throw notFound('Post')
  const input = body(req)
  const commentText = text(input.text, 'Comment', { min: 1, max: 2200 })
  const parentId = input.parentId == null ? null : text(input.parentId, 'parentId', { min: 1, max: 64 })
  if (parentId && getCommentRow(parentId)?.post_id !== postId) throw notFound('Comment')

  const comment = addComment({ postId, authorId: 'me', text: commentText, parentId })
  if (!comment) throw notFound('Post')
  notifySim(() => sim.onUserComment(comment.id))
  res.json(comment)
})

commentRoutes.post('/comments/:id/like', (req, res) => {
  const result = setMyCommentLike(req.params.id, true)
  if (!result) throw notFound('Comment')
  res.json(result)
})

commentRoutes.delete('/comments/:id/like', (req, res) => {
  const result = setMyCommentLike(req.params.id, false)
  if (!result) throw notFound('Comment')
  res.json(result)
})

commentRoutes.post('/comments/:id/pin', (req, res) => {
  const comment = getCommentRow(req.params.id)
  if (!comment) throw notFound('Comment')
  if (getPostRow(comment.post_id)?.author_id !== 'me') throw forbidden('You can only pin comments on your own posts')
  if (comment.parent_id) throw badRequest('Only top-level comments can be pinned')
  res.json({ pinned: togglePin(comment.id) })
})

commentRoutes.delete('/comments/:id', (req, res) => {
  const comment = getCommentRow(req.params.id)
  if (!comment) throw notFound('Comment')
  if (!canDeleteComment(comment)) throw forbidden('You can only delete your comments or comments on your posts')
  deleteComment(comment.id)
  res.json({ ok: true })
})
