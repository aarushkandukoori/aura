/**
 * Notifications: the activity list and "mark all read".
 */
import { Router } from 'express'
import { listNotifications, markAllNotificationsRead } from '../repo/index.ts'
import { queryText } from './http.ts'

export const notificationRoutes = Router()

notificationRoutes.get('/notifications', (req, res) => {
  res.json(listNotifications(queryText(req, 'cursor')))
})

notificationRoutes.post('/notifications/read', (_req, res) => {
  res.json(markAllNotificationsRead())
})
