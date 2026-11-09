/**
 * The session (the first call every app makes), settings, and starting over.
 */
import type { Session, Settings, SignedInAccount, Speed, Tier, UpdateSettingsRequest } from '../../shared/types.ts'
import { currentModel, providerInfo } from '../ai/llm.ts'
import { authEnabled, config, TIERS } from '../config.ts'
import { getUser, toSignedInAccount } from '../db/accounts.ts'
import { bit, currentWorldId, getSetting, q, setSetting, wipeAll } from '../db/index.ts'
import { broadcast } from '../live.ts'
import { broadcastAccount, getMeRow } from './accounts.ts'
import { broadcastMeStats } from './followers.ts'
import { getBadges } from './notifications.ts'
import { getMe } from './profiles.ts'
import { clearAllTyping } from './typing.ts'

export function isOnboarded(): boolean {
  return getSetting<boolean>('onboarded', false) === true
}

export function getSettings(): Settings {
  return {
    tier: getSetting<Tier>('tier', 'popular'),
    speed: getSetting<Speed>('speed', 'fast'),
    model: currentModel(),
    provider: providerInfo(),
    models: config.ai.allowedModels,
  }
}

/** The Google account that owns the current world (null in local mode). */
function signedInAccount(): SignedInAccount | null {
  if (!authEnabled) return null
  const user = getUser(currentWorldId())
  return user ? toSignedInAccount(user) : null
}

/** Works before onboarding too (onboarded: false, me: null). */
export function getSession(): Session {
  const onboarded = isOnboarded()
  return {
    authEnabled,
    account: signedInAccount(),
    onboarded,
    me: onboarded ? getMe() : null,
    settings: getSettings(),
    badges: getBadges(),
  }
}

/** The session for someone who isn't signed in yet (sign-in on, no world): the apps show the sign-in screen. */
export function signedOutSession(): Session {
  return {
    authEnabled,
    account: null,
    onboarded: false,
    me: null,
    settings: { tier: 'popular', speed: 'fast', model: currentModel(), provider: providerInfo(), models: config.ai.allowedModels },
    badges: { notifications: 0, messages: 0 },
  }
}

/** Influencers and icons wear the verified badge. */
export const isVerifiedTier = (tier: Tier): boolean => tier === 'influencer' || tier === 'icon'

/**
 * Change tier, speed or model (the API checks the model is one this server allows). A new tier
 * moves my followers to that tier's base number plus whatever I have gained since (growth
 * carries over). Broadcasts my new counts.
 */
export function updateSettings(changes: UpdateSettingsRequest): Settings {
  if (changes.tier) {
    const oldTier = getSetting<Tier>('tier', 'popular')
    const me = getMeRow()
    if (me && changes.tier !== oldTier) {
      const growth = Math.max(0, me.followers - TIERS[oldTier].followers)
      q("UPDATE accounts SET followers = ?, verified = ? WHERE id = 'me'")
        .run(TIERS[changes.tier].followers + growth, bit(isVerifiedTier(changes.tier)))
    }
    setSetting('tier', changes.tier)
    broadcastMeStats()
    broadcastAccount('me')
  }
  if (changes.speed) setSetting('speed', changes.speed)
  if (changes.model) setSetting('model', changes.model)
  return getSettings()
}

/** Settings > Start over: delete the whole world and send every app back to onboarding. */
export function resetWorld(): void {
  wipeAll()
  clearAllTyping()
  broadcast({ type: 'reset' })
}
