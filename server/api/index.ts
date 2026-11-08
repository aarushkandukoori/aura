/**
 * Every /api route in one router. Session, uploads and the live stream work before onboarding;
 * everything after requireOnboarded needs the world to exist.
 */
import { Router } from 'express'
import { accountRoutes } from './accounts.ts'
import { commentRoutes } from './comments.ts'
import { notFound, requireOnboarded } from './http.ts'
import { liveRoutes } from './live.ts'
import { mediaRoutes } from './media.ts'
import { messageRoutes } from './messages.ts'
import { notificationRoutes } from './notifications.ts'
import { postRoutes } from './posts.ts'
import { sessionRoutes } from './session.ts'
import { storyRoutes } from './stories.ts'

export function apiRouter(): Router {
  const router = Router()
  router.use(sessionRoutes, mediaRoutes, liveRoutes)
  router.use(requireOnboarded)
  router.use(postRoutes, commentRoutes, storyRoutes, accountRoutes, notificationRoutes, messageRoutes)
  router.use(() => {
    throw notFound('API route')
  })
  return router
}
