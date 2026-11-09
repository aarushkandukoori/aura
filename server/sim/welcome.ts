/**
 * The welcome burst right after onboarding: every group chat says hi, two besties DM, an admirer
 * the user doesn't follow sends a message request, and the first new followers arrive. One AI
 * call writes it all (or the templates do), then it plays out over the first minute.
 *
 * When the user described their world at sign-up (server/onboarding), the burst follows the plan:
 * the besties they described DM first, the group chats are the plan's (their titles and vibes go
 * into the prompt), and everyone already knows the facts they shared (the user card's memories).
 * It also starts the friends they described, whom no character fit, joining Aura one step at a
 * time (`new_friend` jobs, server/onboarding/new-friends.ts).
 */
import { welcome, type WelcomeGroup } from '../ai/tasks.ts'
import { getSetting, now, setSetting } from '../db/index.ts'
import { continueNewFriend, scheduleNewFriends } from '../onboarding/new-friends.ts'
import { getCast, getCastMember, getConversationRow, listConversations, randomCrowdIds, type CastMember } from '../repo/index.ts'
import { pick, sample } from '../repo/random.ts'
import { characterFor, DEFAULT_VIBE, userInfo, worldStamp } from './context.ts'
import { schedule } from './scheduler.ts'
import { chatDelay } from './time.ts'

type WelcomePayload = {
  /** Worlds built before new friends got their own job kind may still have a step queued as a welcome job. */
  newFriend?: string
}

/** What onboarding saved about the plan: its besties, most important first. */
type SavedPlan = { besties: string[] }

/** Job welcome: write and schedule the welcome burst (an old queued new-friend step goes on to that friend). */
export async function welcomeUser(payload: WelcomePayload = {}): Promise<void> {
  if (payload.newFriend) return continueNewFriend(payload.newFriend)
  const user = userInfo()
  if (!user) return
  setSetting('lastSeenAt', now())
  // The groups already talk and two besties already DM in the welcome, so the first
  // unprompted chatter and DM opener wait their usual gap.
  setSetting('simLastChatterAt', now())
  setSetting('simLastOpenerAt', now())
  scheduleNewFriends()

  const cast = getCast()
  const plan = getSetting<SavedPlan | null>('worldPlan', null)
  const groups: WelcomeGroup[] = listConversations()
    .filter((chat) => chat.kind === 'group')
    .map((chat) => ({
      id: chat.id,
      title: chat.title,
      vibe: getConversationRow(chat.id)?.vibe ?? DEFAULT_VIBE,
      members: chat.members.flatMap((member) => getCastMember(member.id) ?? []),
    }))
  const world = worldStamp()
  const result = await welcome({ user, groups, besties: welcomeBesties(cast, plan), fan: requestSender(cast) })
  if (worldStamp() !== world) return // Start over happened while the AI was writing

  // With a plan, the besties the user described text first; then the chats light up one after another.
  const dmStart = plan ? chatDelay(3, 5) : chatDelay(6, 10)
  const groupStart = plan ? chatDelay(14, 18) : chatDelay(2, 5)
  result.dms.forEach((dm, index) => {
    schedule('cast_dm', dmStart + index * chatDelay(12, 16), { accountId: dm.by, texts: dm.messages, firstOnly: true })
  })
  result.groups.forEach((group, index) => {
    if (group.lines.length === 0) return
    schedule('group_lines', groupStart + index * chatDelay(10, 14), { conversationId: group.conversationId, lines: group.lines })
  })
  if (result.request) {
    const request = { accountId: result.request.by, texts: result.request.messages, isRequest: true, firstOnly: true }
    schedule('cast_dm', chatDelay(35, 50), request)
  }
  schedule('world_event', chatDelay(8, 12), { event: 'followers' })
}

/** The two besties who DM: the plan's first two (the people the user described first), or any two. */
function welcomeBesties(cast: CastMember[], plan: SavedPlan | null): CastMember[] {
  const besties = cast.filter((member) => member.role === 'bestie')
  if (!plan) return sample(besties, 2)
  const planned = plan.besties.flatMap((id) => besties.find((member) => member.id === id) ?? [])
  return (planned.length > 0 ? planned : besties).slice(0, 2)
}

/**
 * A message request comes from someone the user doesn't follow (that's what puts it in Requests):
 * a fan they never followed back or, since onboarding follows every fan, one of their followers.
 */
function requestSender(cast: CastMember[]): CastMember | null {
  const strangers = cast.filter((member) => member.role === 'fan' && !member.iFollow)
  if (strangers.length > 0) return pick(strangers)
  const followerId = randomCrowdIds(1, { followingMe: true })[0]
  return followerId ? characterFor(followerId) : null
}
