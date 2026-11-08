/**
 * Stories: the tray, one person's stories, highlights, posting, seen, viewers, replies and
 * reactions (both arrive in the author's DMs), and deleting.
 */
import { Router } from 'express'
import type { Message, StoryOverlay, StoryReplyResponse } from '../../shared/types.ts'
import * as sim from '../sim/index.ts'
import {
  createStory, deleteStory, getHighlightStories, getOrCreateDm, getStoryRow, getStoryTrays, getUserTray, getViewers,
  markStorySeen, sendMyMessage, storyThumb,
} from '../repo/index.ts'
import { badRequest, body, forbidden, media, notFound, notifySim, nullableText, text } from './http.ts'

export const storyRoutes = Router()

/** The text drawn over a story: optional, with color, pill background and vertical position. */
function overlayField(value: unknown): StoryOverlay | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'object') throw badRequest('overlay must be an object')
  const input = value as Record<string, unknown>
  const y = input.y == null ? null : Number(input.y)
  if (y !== null && !(y >= 0 && y <= 1)) throw badRequest('overlay.y must be between 0 and 1')
  return {
    text: nullableText(input.text, 'Story text', 200),
    color: nullableText(input.color, 'overlay.color', 40),
    background: nullableText(input.background, 'overlay.background', 60),
    y,
  }
}

/** Reply to a story in a DM with its author (creating the DM if needed), with the story attached. */
function replyToStory(storyId: string, replyText: string): Message {
  const story = getStoryRow(storyId)
  if (!story || story.released !== 1) throw notFound('Story')
  if (story.author_id === 'me') throw badRequest("You can't reply to your own story")
  const dm = getOrCreateDm(story.author_id)
  if (!dm) throw notFound('Account')
  const message = sendMyMessage({ conversationId: dm.id, text: replyText, storyId: story.id, storyThumb: storyThumb(story) })
  if (!message) throw notFound('Conversation')
  notifySim(() => sim.onUserMessage(dm.id, message.id))
  return message
}

storyRoutes.get('/stories', (_req, res) => {
  res.json(getStoryTrays())
})

storyRoutes.get('/stories/user/:username', (req, res) => {
  const tray = getUserTray(req.params.username)
  if (!tray) throw notFound('Story')
  res.json(tray)
})

storyRoutes.get('/highlights/:id', (req, res) => {
  const stories = getHighlightStories(req.params.id)
  if (!stories) throw notFound('Highlight')
  res.json(stories)
})

storyRoutes.post('/stories', (req, res) => {
  const input = body(req)
  const story = createStory(media(input.media), overlayField(input.overlay))
  notifySim(() => sim.onUserStory(story.id))
  res.json(story)
})

storyRoutes.post('/stories/:id/seen', (req, res) => {
  if (!markStorySeen(req.params.id)) throw notFound('Story')
  res.json({ ok: true })
})

storyRoutes.get('/stories/:id/viewers', (req, res) => {
  const story = getStoryRow(req.params.id)
  if (!story) throw notFound('Story')
  if (story.author_id !== 'me') throw forbidden('Only the author can see who viewed a story')
  res.json(getViewers(story.id))
})

storyRoutes.post('/stories/:id/reply', (req, res) => {
  const message = replyToStory(req.params.id, text(body(req).text, 'Reply', { min: 1, max: 1000 }))
  const response: StoryReplyResponse = { conversationId: message.conversationId }
  res.json(response)
})

storyRoutes.post('/stories/:id/react', (req, res) => {
  replyToStory(req.params.id, text(body(req).emoji, 'emoji', { min: 1, max: 16 }))
  res.json({ ok: true })
})

storyRoutes.delete('/stories/:id', (req, res) => {
  const story = getStoryRow(req.params.id)
  if (!story) throw notFound('Story')
  if (story.author_id !== 'me') throw forbidden('You can only delete your own stories')
  deleteStory(story.id)
  res.json({ ok: true })
})
