/**
 * Session, health, onboarding, profile edits, settings, start over and badges.
 * publicRoutes also work signed out; sessionRoutes need a world but work before onboarding
 * (except PATCH /me).
 *
 * Onboarding has two calls: POST /onboarding/plan turns what the user said about their world into a
 * plan to review (server/onboarding/plan.ts), and POST /onboarding builds the world, following the
 * plan when one comes along (server/seed/world.ts).
 */
import { Router } from 'express'
import type { Health, OnboardingRequest, Speed, Tier, UpdateMeRequest, WorldPlan, WorldPlanRequest } from '../../shared/types.ts'
import { providerInfo } from '../ai/llm.ts'
import { config, SPEEDS, TIERS } from '../config.ts'
import { hasWorld, setSetting } from '../db/index.ts'
import { importAccountPicture, isAccountPicture } from '../onboarding/picture.ts'
import { makeWorldPlan, TRANSCRIPT_LIMIT } from '../onboarding/plan.ts'
import {
  getAccountByUsername, getBadges, getSession, getSettings, isOnboarded, resetWorld, signedOutSession, updateMe,
  updateSettings,
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

/** An avatar is an uploaded file or a preset; null / "" means none. */
function avatarField(value: unknown): string | null {
  return value === null || value === '' ? null : mediaUrl(value, 'avatar')
}

/** At onboarding the signed-in Google account's own picture also works: it is copied into this world. */
async function onboardingAvatar(value: unknown): Promise<string | null> {
  if (isAccountPicture(value)) return importAccountPicture(value)
  return value === undefined ? null : avatarField(value)
}

/** The plan from POST /api/onboarding/plan rides along as-is; seed code checks its fields. */
function planField(value: unknown): WorldPlan | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'object' || Array.isArray(value)) throw badRequest('plan must be an object')
  return value as WorldPlan
}

// ----- routes that work signed out ------------------------------------------------------------

export const publicRoutes = Router()

/** Signed out (sign-in on, no world): authEnabled true, account null, and the apps show sign-in. */
publicRoutes.get('/session', (_req, res) => {
  res.json(hasWorld() ? getSession() : signedOutSession())
})

publicRoutes.get('/health', (_req, res) => {
  const images = imagesStatus()
  const health: Health = {
    ok: true,
    onboarded: hasWorld() && isOnboarded(),
    provider: providerInfo(),
    castCount: loadContent().cast.length,
    imagesReady: images.ready,
    imagesTotal: images.total,
  }
  res.json(health)
})

publicRoutes.get('/avatars', (_req, res) => {
  res.json(loadContent().crowd.presets.map((image) => image.file))
})

// ----- routes that need a world -----------------------------------------------------------------

export const sessionRoutes = Router()

const ALREADY_SET_UP = 'Already set up. Use Settings > Start over to begin again.'

/** The plan to review: one AI call reads what the user said (keyword rules when AI is off). Can take ~30 s. */
sessionRoutes.post('/onboarding/plan', async (req, res) => {
  if (isOnboarded()) throw new HttpError(409, ALREADY_SET_UP)
  const input = body(req)
  const transcript = typeof input.transcript === 'string' ? input.transcript.trim() : ''
  if (transcript.length < 3) throw badRequest('Tell us a little about your world first')
  const request: WorldPlanRequest = {
    transcript: transcript.slice(0, TRANSCRIPT_LIMIT),
    displayName: input.displayName == null ? null : text(input.displayName, 'displayName', { max: 80 }),
  }
  res.json(await makeWorldPlan(request))
})

sessionRoutes.post('/onboarding', async (req, res) => {
  if (isOnboarded()) throw new HttpError(409, ALREADY_SET_UP)
  const input = body(req)
  const request: OnboardingRequest = {
    displayName: text(input.displayName, 'Name', { min: 1, max: 40 }),
    username: username(input.username),
    avatar: null, // checked last: it may have to be downloaded
    bio: text(input.bio ?? '', 'Bio', { max: 150 }),
    pronouns: text(input.pronouns ?? '', 'Pronouns', { max: 30 }),
    interests: wordList(input.interests, 'Interests', { min: 1, max: 12, length: 30 }),
    tier: oneOf(input.tier, TIER_NAMES, 'tier'),
    // A plan says it in the user's own words ("the climbing gym and nursing school").
    origin: text(input.origin ?? 'college', 'origin', { min: 1, max: 80 }),
    plan: planField(input.plan),
  }
  if (usernameTakenByCharacters(request.username)) throw badRequest('That username is taken')
  request.avatar = await onboardingAvatar(input.avatar)
  // Another tab may have finished onboarding while the picture downloaded.
  if (isOnboarded()) throw new HttpError(409, ALREADY_SET_UP)
  buildWorld(request)
  // A new world starts on this server's default model (a public server may only allow the cheap one).
  setSetting('model', config.ai.defaultModel)
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
  const models = config.ai.allowedModels
  if (input.model !== undefined && !(models as unknown[]).includes(input.model)) {
    throw badRequest(models.length === 1 ? `This server only runs ${models[0]}` : `model must be one of: ${models.join(', ')}`)
  }
  const speedBefore = getSettings().speed
  const settings = updateSettings({
    tier: input.tier === undefined ? undefined : oneOf(input.tier, TIER_NAMES, 'tier'),
    speed: input.speed === undefined ? undefined : oneOf(input.speed, SPEED_NAMES, 'speed'),
    model: input.model === undefined ? undefined : oneOf(input.model, models, 'model'),
  })
  notifySim(() => sim.onSettingsChanged(speedBefore))
  res.json(settings)
})

sessionRoutes.post('/reset', (_req, res) => {
  resetWorld()
  notifySim(() => sim.onWorldReset())
  res.json({ ok: true })
})

sessionRoutes.get('/badges', (_req, res) => {
  res.json(getBadges())
})
