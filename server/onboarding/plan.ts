/**
 * POST /api/onboarding/plan: during sign-up the user talks or types for about a minute about the
 * world they want, and one AI call turns it into a WorldPlan they can review (shared/types.ts):
 * their profile, interests, how popular they want to be, which characters are their people and how
 * they know each other, their group chats, friends to create from scratch, and facts everyone knows.
 *
 * Without AI (offline mode, a daily cap, a failed call) the keyword version in offline.ts answers.
 * Either way cleanPlan() checks every field before the app sees it.
 */
import type { CastPersona } from '../../shared/cast.ts'
import type { WorldPlan, WorldPlanRequest } from '../../shared/types.ts'
import { askJson } from '../ai/llm.ts'
import { config } from '../config.ts'
import { getSetting, setSetting, worldState } from '../db/index.ts'
import { loadContent } from '../seed/content.ts'
import { cleanPlan, clip } from './clean.ts'
import { offlinePlan } from './offline.ts'
import { PLAN_SYSTEM } from './prompts.ts'
import { pickableCast, rosterLine } from './roster.ts'

/** How much of the transcript the plan reads (the contract promises the first ~3,000 characters). */
export const TRANSCRIPT_LIMIT = 3000
/** Plans a world may ask the AI for per day (each one is a big call); after that the keyword version answers. */
const AI_PLANS_PER_DAY = 12

/** The settings key for the AI's rewritten character descriptions, used when the world is built (seed/plan.ts). */
export const PLAN_CONCEPTS_KEY = 'planConcepts'

/**
 * Per world: the plan being written right now. A newer request (say, after going back to change a
 * word) waits for it to finish first, so one person's plans never run side by side.
 */
const planning = worldState((): { current: Promise<WorldPlan> | null } => ({ current: null }))

/** What the AI answers: a WorldPlan without previews, plus a fresh "who they are" line per chosen character. */
interface AiPlan extends Omit<WorldPlan, 'friends'> {
  friends: { id: string; role: 'bestie' | 'friend'; relationship: string; concept: string }[]
}

export async function makeWorldPlan(request: WorldPlanRequest): Promise<WorldPlan> {
  const state = planning()
  while (state.current) await state.current.catch(() => {})
  const work = writePlan(request)
  state.current = work
  try {
    return await work
  } finally {
    if (state.current === work) state.current = null
  }
}

async function writePlan(request: WorldPlanRequest): Promise<WorldPlan> {
  const transcript = request.transcript.trim().slice(0, TRANSCRIPT_LIMIT)
  const accountName = clip(request.displayName, 60) || null
  const { cast } = loadContent()
  const answer = await askForPlan(transcript, accountName, cast)
  const plan = cleanPlan(answer ?? offlinePlan(transcript, accountName, cast), { cast, fallbackName: accountName })
  saveConcepts(answer, plan)
  return plan
}

/** The AI's plan, or null when there is no AI right now (the caller uses the keyword version). */
async function askForPlan(transcript: string, accountName: string | null, cast: CastPersona[]): Promise<AiPlan | null> {
  const roster = pickableCast(cast)
  if (roster.length === 0 || !countPlanCall()) return null
  const prompt = [
    `Google account name: ${accountName ?? 'unknown'}`,
    `What they said (speech-to-text, so punctuation may be missing and some words misheard):\n"""\n${transcript}\n"""`,
    `The roster (use the id in brackets):\n${roster.map(rosterLine).join('\n')}`,
  ].join('\n\n')
  try {
    return await askJson<AiPlan>({
      label: 'world-plan',
      system: PLAN_SYSTEM,
      prompt,
      schema: planSchema(roster.map((persona) => persona.id)),
      model: config.ai.defaultModel,
      effort: 'medium',
      timeoutMs: 150_000,
    })
  } catch {
    return null // llm.ts already logged why
  }
}

/** Count one AI plan for this world today; false once the day's allowance is used up. */
function countPlanCall(): boolean {
  const today = new Date().toDateString()
  const saved = getSetting<{ date: string; count: number } | null>('aiPlans', null)
  const count = saved?.date === today ? saved.count : 0
  if (count >= AI_PLANS_PER_DAY) {
    console.warn(`[onboarding] ${AI_PLANS_PER_DAY} AI plans today in this world: using the keyword plan`)
    return false
  }
  setSetting('aiPlans', { date: today, count: count + 1 })
  return true
}

/**
 * The AI also rewrote each chosen character's "who they are" line without the old story of how
 * they met the user (the new story is in the relationship). The app never sees these; the world
 * uses them when it is built, so a character isn't both "the user's college roommate" and "the
 * user's coworker at the hospital".
 */
function saveConcepts(answer: AiPlan | null, plan: WorldPlan): void {
  const concepts: Record<string, string> = {}
  for (const friend of answer?.friends ?? []) {
    const concept = clip(friend.concept, 300)
    if (concept && plan.friends.some((chosen) => chosen.id === friend.id)) concepts[friend.id] = concept
  }
  setSetting(PLAN_CONCEPTS_KEY, concepts)
}

const TEXT = { type: 'string' }
const TEXTS = { type: 'array', items: TEXT }
const object = (properties: Record<string, unknown>) => ({ type: 'object', properties })

function planSchema(ids: string[]): Record<string, unknown> {
  const id = { type: 'string', enum: ids }
  return object({
    displayName: TEXT,
    username: TEXT,
    bio: TEXT,
    pronouns: TEXT,
    interests: TEXTS,
    origin: TEXT,
    tier: { type: 'string', enum: ['rising', 'popular', 'influencer', 'icon'] },
    summary: TEXT,
    friends: { type: 'array', items: object({ id, role: { type: 'string', enum: ['bestie', 'friend'] }, relationship: TEXT, concept: TEXT }) },
    groupChats: { type: 'array', items: object({ title: TEXT, emoji: TEXT, vibe: TEXT, memberIds: { type: 'array', items: id } }) },
    newFriends: { type: 'array', items: object({ name: TEXT, description: TEXT, role: { type: 'string', enum: ['bestie', 'friend', 'mutual'] } }) },
    memories: TEXTS,
  })
}
