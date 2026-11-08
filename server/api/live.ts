/**
 * GET /api/live: the Server-Sent Events stream every open app keeps connected.
 * The first event is `hello` with the current badges; server/live.ts sends the rest.
 */
import { Router } from 'express'
import { addClient } from '../live.ts'
import { getBadges } from '../repo/index.ts'

export const liveRoutes = Router()

liveRoutes.get('/live', (_req, res) => {
  addClient(res, { type: 'hello', serverTime: Date.now(), badges: getBadges() })
})
