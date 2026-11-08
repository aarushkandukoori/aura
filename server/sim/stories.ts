/**
 * Stories: when the user posts one, views arrive in waves (every character eventually, closest
 * first, plus the crowd), a few people react with an emoji, and a friend or two replies by DM.
 */
import type { Media, StoryOverlay, Tier } from '../../shared/types.ts'
import { storyReactions } from '../ai/tasks.ts'
import { TIERS } from '../config.ts'
import { getSetting, parseJson } from '../db/index.ts'
import { addStoryViews, bumpAura, getCast, getStoryRow, randomCrowdIds, reactToStory } from '../repo/index.ts'
import { randomBetween, randomInt } from '../repo/random.ts'
import { imagesFor, userInfo } from './context.ts'
import { auraFor, inRange, splitByShares, VIEW_WAVES, waveShares } from './curve.ts'
import { hasPending, schedule } from './scheduler.ts'
import { simDelay } from './time.ts'

/** Job story_react: plan the views, reactions and replies for a story of mine. */
export async function reactToNewStory({ storyId }: { storyId: string }): Promise<void> {
  const story = getStoryRow(storyId)
  const user = userInfo()
  if (!story || story.author_id !== 'me' || !user) return
  const cast = getCast() // closest first
  // If the server restarted while the AI was writing, this job runs again: its views are already planned.
  if (!hasPending('story_views', 'storyId', storyId)) {
    scheduleViewWaves(storyId, inRange(TIERS[getSetting<Tier>('tier', 'popular')].storyViews), cast.map((member) => member.id))
  }

  const media = parseJson<Media | null>(story.media, null)
  const overlay = parseJson<StoryOverlay | null>(story.overlay, null)
  const result = await storyReactions({
    user,
    images: media ? imagesFor([media], 1) : [],
    overlayText: overlay?.text ?? null,
    viewers: cast.slice(0, 12),
  })
  if (!getStoryRow(storyId)) return // deleted (or Start over) while the AI was writing
  for (const reaction of result.reactions) {
    schedule('story_reaction', simDelay(randomBetween(1, 30)), { storyId, accountId: reaction.by, emoji: reaction.emoji })
  }
  for (const reply of result.replies) {
    schedule('cast_dm', simDelay(randomBetween(2, 20)), { accountId: reply.by, texts: reply.messages, story: { id: storyId } })
  }
}

/**
 * Views in waves. Characters watch it in order of closeness over the first dozen waves, a few
 * dozen named followers fill out the "Seen by" list, and the rest of the total is the crowd.
 */
function scheduleViewWaves(storyId: string, total: number, castIds: string[]): void {
  const named = [...castIds, ...randomCrowdIds(randomInt(15, 30), { followingMe: true })]
  const parts = splitByShares(total, waveShares(VIEW_WAVES, 30))
  const namedPerWave = Math.ceil(named.length / 12)
  VIEW_WAVES.forEach((minute, index) => {
    const viewers = named.slice(index * namedPerWave, (index + 1) * namedPerWave)
    schedule('story_views', simDelay(minute), { storyId, named: viewers, crowd: Math.max(0, parts[index] - viewers.length) })
  })
}

/** Job story_views: one wave of views on a story of mine. */
export function storyViewWave({ storyId, named, crowd }: { storyId: string; named: string[]; crowd: number }): void {
  if (!getStoryRow(storyId)) return
  addStoryViews(storyId, named, crowd)
  bumpAura(auraFor({ views: named.length + crowd }))
}

/** Job story_reaction: someone reacts to a story of mine with an emoji. */
export function storyReaction({ storyId, accountId, emoji }: { storyId: string; accountId: string; emoji: string }): void {
  reactToStory(storyId, accountId, emoji)
}
