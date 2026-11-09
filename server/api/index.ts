/**
 * Every /api route in one router, in three layers:
 * 1. enterWorld runs each request inside the caller's world (the local world when sign-in is off).
 *    The session, health and preset avatars work even when signed out.
 * 2. requireSignIn: everything else needs a world (401 when signed out). Onboarding, settings,
 *    uploads and the live stream work before onboarding.
 * 3. requireOnboarded: the rest needs the world to be built (409 before onboarding).
 */
import { Router } from 'express'
import { enterWorld } from '../auth/sessions.ts'
import { accountRoutes } from './accounts.ts'
import { commentRoutes } from './comments.ts'
import { recsRoutes } from './events.ts'
import { notFound, requireOnboarded, requireSignIn } from './http.ts'
import { liveRoutes } from './live.ts'
import { mediaRoutes } from './media.ts'
import { messageRoutes } from './messages.ts'
import { notificationRoutes } from './notifications.ts'
import { postRoutes } from './posts.ts'
import { publicRoutes, sessionRoutes } from './session.ts'
import { storyRoutes } from './stories.ts'

export function apiRouter(): Router {
  const router = Router()
  router.use(enterWorld)
  router.use(publicRoutes)
  router.use(requireSignIn)
  router.use(sessionRoutes, mediaRoutes, liveRoutes)
  router.use(requireOnboarded)
  // First: it learns from the requests below (likes, follows...) and takes POST /events and GET /suggestions.
  router.use(recsRoutes)
  router.use(postRoutes, commentRoutes, storyRoutes, accountRoutes, notificationRoutes, messageRoutes)
  router.use(() => {
    throw notFound('API route')
  })
  return router
}
