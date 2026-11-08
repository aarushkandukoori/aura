/**
 * Session, health, onboarding, profile edits, settings, start over and badges.
 * Everything here works before onboarding except PATCH /me.
 */
import { Router } from 'express'
import type { AiModel, Health, OnboardingRequest, Speed, Tier, UpdateMeRequest } from '../../shared/types.ts'
import { MODEL_IDS, providerInfo, setDefaultModel } from '../ai/llm.ts'
import { SPEEDS, TIERS } from '../config.ts'
import {
  getAccountByUsername, getBadges, getSession, getSettings, isOnboarded, resetWorld, updateMe, updateSettings,
} from '../repo/index.ts'
import { loadContent, usernameTakenByCharacters } from '../seed/content.ts'
import { imagesStatus } from '../seed/images.ts'
import { buildWorld } from '../seed/world.ts'
import * as sim from '../sim/index.ts'
import {
  badRequest, body, HttpError, mediaUrl, notifySim, oneOf, optionalText, requireOnboarded, text, username, wordList,
} from './http.ts'

const TIER_NAMES = Object.keys(TIERS) as Tier[]
const SPEED_NAMES = Object.keys(SPEEDS) as Speed[]
const MODEL_NAMES = Object.keys(MODEL_IDS) as AiModel[]

/** An avatar is an uploaded file or a preset; null / "" means none. */
function avatarField(value: unknown): string | null {
  return value === null || value === '' ? null : mediaUrl(value, 'avatar')
}

export const sessionRoutes = Router()

sessionRoutes.get('/session', (_req, res) => {
  res.json(getSession())
})

sessionRoutes.get('/health', (_req, res) => {
  const images = imagesStatus()
  const health: Health = {
    ok: true,
    onboarded: isOnboarded(),
    provider: providerInfo(),
    castCount: loadContent().cast.length,
    imagesReady: images.ready,
    imagesTotal: images.total,
  }
  res.json(health)
})

sessionRoutes.get('/avatars', (_req, res) => {
  res.json(loadContent().crowd.presets.map((image) => image.file))
})

sessionRoutes.post('/onboarding', (req, res) => {
  if (isOnboarded()) throw new HttpError(409, 'Already set up. Use Settings > Start over to begin again.')
  const input = body(req)
  const request: OnboardingRequest = {
    displayName: text(input.displayName, 'Name', { min: 1, max: 40 }),
    username: username(input.username),
    avatar: input.avatar === undefined ? null : avatarField(input.avatar),
    bio: text(input.bio ?? '', 'Bio', { max: 150 }),
    pronouns: text(input.pronouns ?? '', 'Pronouns', { max: 30 }),
    interests: wordList(input.interests, 'Interests', { min: 1, max: 12, length: 30 }),
    tier: oneOf(input.tier, TIER_NAMES, 'tier'),
    origin: text(input.origin ?? 'college', 'origin', { min: 1, max: 40 }),
  }
  if (usernameTakenByCharacters(request.username)) throw badRequest('That username is taken')
  buildWorld(request)
  setDefaultModel('opus')
  notifySim(() => sim.onOnboarded())
  res.json(getSession())
})

sessionRoutes.patch('/me', requireOnboarded, (req, res) => {
  const input = body(req)
  const changes: UpdateMeRequest = {
    displayName: optionalText(input.displayName, 'Name', { min: 1, max: 40 }),
    username: input.username === undefined ? undefined : username(input.username),
    avatar: input.avatar === undefined ? undefined : avatarField(input.avatar),
    bio: optionalText(input.bio, 'Bio', { max: 150 }),
    pronouns: optionalText(input.pronouns, 'Pronouns', { max: 30 }),
    interests: input.interests === undefined ? undefined : wordList(input.interests, 'Interests', { min: 1, max: 12, length: 30 }),
  }
  if (changes.username) {
    const owner = getAccountByUsername(changes.username)
    if (owner && owner.id !== 'me') throw badRequest('That username is taken')
  }
  res.json(updateMe(changes))
})

sessionRoutes.get('/settings', (_req, res) => {
  res.json(getSettings())
})

sessionRoutes.patch('/settings', (req, res) => {
  const input = body(req)
  const settings = updateSettings({
    tier: input.tier === undefined ? undefined : oneOf(input.tier, TIER_NAMES, 'tier'),
    speed: input.speed === undefined ? undefined : oneOf(input.speed, SPEED_NAMES, 'speed'),
    model: input.model === undefined ? undefined : oneOf(input.model, MODEL_NAMES, 'model'),
  })
  notifySim(() => sim.onSettingsChanged())
  res.json(settings)
})

sessionRoutes.post('/reset', (_req, res) => {
  notifySim(() => sim.stop())
  resetWorld()
  notifySim(() => sim.start())
  res.json({ ok: true })
})

sessionRoutes.get('/badges', (_req, res) => {
  res.json(getBadges())
})
