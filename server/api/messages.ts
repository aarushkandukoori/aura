/**
 * Messages: the inbox, starting DMs and groups, chat settings, requests, reading and sending
 * messages, and emoji reactions.
 */
import { Router } from 'express'
import * as sim from '../sim/index.ts'
import {
  acceptRequest, broadcastConversation, createGroup, deleteConversation, getAccountRow, getConversation,
  getConversationRow, getInbox, getMessageRow, getMessagesPage, getOrCreateDm, getVisiblePostRow, markRead,
  reactToMessage, sendMyMessage, updateConversation,
} from '../repo/index.ts'
import { badRequest, body, bool, idList, media, notFound, notifySim, nullableText, queryText, text } from './http.ts'

export const messageRoutes = Router()

/** The conversation row for :id, or a 404. */
function conversationRow(id: string) {
  const row = getConversationRow(id)
  if (!row) throw notFound('Conversation')
  return row
}

messageRoutes.get('/conversations', (_req, res) => {
  res.json(getInbox())
})

/** One member = the DM with them (reused if it exists). Two or more = a new group. */
messageRoutes.post('/conversations', (req, res) => {
  const input = body(req)
  const memberIds = idList(input.memberIds, 'memberIds', { min: 1, max: 31 })
  for (const id of memberIds) {
    if (id === 'me') throw badRequest("You're in every chat you start already")
    if (!getAccountRow(id)) throw notFound('Account')
  }
  const title = nullableText(input.title, 'Group name', 60)
  const conversation = memberIds.length === 1
    ? getOrCreateDm(memberIds[0])
    : createGroup({ memberIds, title, vibe: 'a new group chat the user just started' })
  if (!conversation) throw notFound('Account')
  broadcastConversation(conversation.id)
  res.json(conversation)
})

messageRoutes.get('/conversations/:id', (req, res) => {
  res.json(getConversation(conversationRow(req.params.id).id))
})

messageRoutes.patch('/conversations/:id', (req, res) => {
  const row = conversationRow(req.params.id)
  const input = body(req)
  if ((input.title !== undefined || input.emoji !== undefined) && row.kind !== 'group') {
    throw badRequest('Only group chats have a name and an emoji')
  }
  res.json(updateConversation(row.id, {
    title: input.title === undefined ? undefined : nullableText(input.title, 'Group name', 60),
    emoji: input.emoji === undefined ? undefined : nullableText(input.emoji, 'emoji', 16),
    muted: input.muted === undefined ? undefined : bool(input.muted, 'muted'),
  }))
})

messageRoutes.post('/conversations/:id/accept', (req, res) => {
  res.json(acceptRequest(conversationRow(req.params.id).id))
})

messageRoutes.delete('/conversations/:id', (req, res) => {
  deleteConversation(conversationRow(req.params.id).id)
  res.json({ ok: true })
})

messageRoutes.get('/conversations/:id/messages', (req, res) => {
  res.json(getMessagesPage(conversationRow(req.params.id).id, queryText(req, 'cursor')))
})

messageRoutes.post('/conversations/:id/messages', (req, res) => {
  const conversation = conversationRow(req.params.id)
  const input = body(req)
  const messageText = input.text == null ? '' : text(input.text, 'Message', { max: 2000 })
  const photo = input.media == null ? null : media(input.media)
  const sharedPostId = input.sharedPostId == null ? null : text(input.sharedPostId, 'sharedPostId', { min: 1, max: 64 })
  const replyToId = input.replyToId == null ? null : text(input.replyToId, 'replyToId', { min: 1, max: 64 })
  if (sharedPostId && !getVisiblePostRow(sharedPostId)) throw notFound('Post')
  if (replyToId && getMessageRow(replyToId)?.conversation_id !== conversation.id) throw notFound('Message')
  if (!messageText && !photo && !sharedPostId) throw badRequest("Can't send an empty message")

  const message = sendMyMessage({ conversationId: conversation.id, text: messageText, media: photo, sharedPostId, replyToId })
  if (!message) throw notFound('Conversation')
  notifySim(() => sim.onUserMessage(conversation.id, message.id))
  res.json(message)
})

messageRoutes.post('/conversations/:id/read', (req, res) => {
  const id = conversationRow(req.params.id).id
  const badges = markRead(id)
  notifySim(() => sim.onUserReadConversation(id))
  res.json(badges)
})

/** Set my reaction on a message; { emoji: null } removes it. */
messageRoutes.post('/messages/:id/react', (req, res) => {
  const input = body(req)
  const emoji = input.emoji === null ? null : text(input.emoji, 'emoji', { min: 1, max: 16 })
  const reactions = reactToMessage(req.params.id, 'me', emoji)
  if (!reactions) throw notFound('Message')
  res.json(reactions)
})
