/**
 * Profiles, profile grids, follower lists, follow / unfollow, suggestions and search.
 */
import { Router } from 'express'
import type { SearchResult } from '../../shared/types.ts'
import * as sim from '../sim/index.ts'
import {
  followList, getAccountByUsername, getAccountRow, getProfile, getProfilePosts, getSuggestions, searchAccounts,
  searchTags, setFollow,
} from '../repo/index.ts'
import { badRequest, notFound, notifySim, oneOf, queryText } from './http.ts'

export const accountRoutes = Router()

accountRoutes.get('/accounts/:username', (req, res) => {
  const profile = getProfile(req.params.username)
  if (!profile) throw notFound('Account')
  res.json(profile)
})

accountRoutes.get('/accounts/:username/posts', (req, res) => {
  const account = getAccountByUsername(req.params.username)
  if (!account) throw notFound('Account')
  const tab = oneOf(queryText(req, 'tab') ?? 'posts', ['posts', 'reels', 'tagged'] as const, 'tab')
  res.json(getProfilePosts(account.id, tab, queryText(req, 'cursor')))
})

accountRoutes.get('/accounts/:username/followers', (req, res) => {
  const account = getAccountByUsername(req.params.username)
  if (!account) throw notFound('Account')
  res.json(followList(account, 'followers', queryText(req, 'cursor'), queryText(req, 'q') ?? ''))
})

accountRoutes.get('/accounts/:username/following', (req, res) => {
  const account = getAccountByUsername(req.params.username)
  if (!account) throw notFound('Account')
  res.json(followList(account, 'following', queryText(req, 'cursor'), queryText(req, 'q') ?? ''))
})

accountRoutes.post('/accounts/:id/follow', (req, res) => {
  const row = getAccountRow(req.params.id)
  if (!row) throw notFound('Account')
  if (row.kind === 'me') throw badRequest("You can't follow yourself")
  const account = setFollow(row.id, true)
  if (row.i_follow !== 1) notifySim(() => sim.onUserFollow(row.id))
  res.json(account)
})

accountRoutes.delete('/accounts/:id/follow', (req, res) => {
  const row = getAccountRow(req.params.id)
  if (!row) throw notFound('Account')
  if (row.kind === 'me') throw badRequest("You can't unfollow yourself")
  res.json(setFollow(row.id, false))
})

accountRoutes.get('/suggestions', (_req, res) => {
  res.json(getSuggestions())
})

accountRoutes.get('/search', (req, res) => {
  const query = (queryText(req, 'q') ?? '').slice(0, 60)
  const result: SearchResult = { accounts: searchAccounts(query), tags: searchTags(query) }
  res.json(result)
})
