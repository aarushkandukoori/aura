/**
 * GET /api/live: the Server-Sent Events stream every open app keeps connected (the iPhone app
 * signs it with its Bearer token like any other request). The first event is `hello` with the
 * current badges; server/live.ts sends the rest. Signing out ends the stream.
 */
import { Router } from 'express'
import { sessionKeyOf } from '../auth/sessions.ts'
import { addClient } from '../live.ts'
import { getBadges } from '../repo/index.ts'

export const liveRoutes = Router()

liveRoutes.get('/live', (req, res) => {
  addClient(res, { type: 'hello', serverTime: Date.now(), badges: getBadges() }, sessionKeyOf(req))
})
