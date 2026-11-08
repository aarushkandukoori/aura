/**
 * The welcome burst right after onboarding: every group chat says hi, two besties DM, an admirer
 * the user doesn't follow sends a message request, and the first new followers arrive. One AI
 * call writes it all (or the templates do), then it plays out over the first minute.
 */
import { welcome, type WelcomeGroup } from '../ai/tasks.ts'
import { now, setSetting } from '../db/index.ts'
import { getCast, getCastMember, getConversationRow, listConversations, randomCrowdIds, type CastMember } from '../repo/index.ts'
import { pick, sample } from '../repo/random.ts'
import { characterFor, DEFAULT_VIBE, userInfo, worldStamp } from './context.ts'
import { schedule } from './scheduler.ts'
import { chatDelay } from './time.ts'

/** Job welcome: write and schedule the welcome burst. */
export async function welcomeUser(): Promise<void> {
  const user = userInfo()
  if (!user) return
  setSetting('lastSeenAt', now())
  // The groups already talk and two besties already DM in the welcome, so the first
  // unprompted chatter and DM opener wait their usual gap.
  setSetting('simLastChatterAt', now())
  setSetting('simLastOpenerAt', now())

  const cast = getCast()
  const groups: WelcomeGroup[] = listConversations()
    .filter((chat) => chat.kind === 'group')
    .map((chat) => ({
      id: chat.id,
      title: chat.title,
      vibe: getConversationRow(chat.id)?.vibe ?? DEFAULT_VIBE,
      members: chat.members.flatMap((member) => getCastMember(member.id) ?? []),
    }))
  const world = worldStamp()
  const plan = await welcome({
    user,
    groups,
    besties: sample(cast.filter((member) => member.role === 'bestie'), 2),
    fan: requestSender(cast),
  })
  if (worldStamp() !== world) return // Start over happened while the AI was writing

  // Staggered, so the chats light up one after another instead of all at once.
  plan.groups.forEach((group, index) => {
    if (group.lines.length === 0) return
    schedule('group_lines', chatDelay(2, 5) + index * chatDelay(10, 14), { conversationId: group.conversationId, lines: group.lines })
  })
  plan.dms.forEach((dm, index) => {
    schedule('cast_dm', chatDelay(6, 10) + index * chatDelay(12, 16), { accountId: dm.by, texts: dm.messages, firstOnly: true })
  })
  if (plan.request) {
    const request = { accountId: plan.request.by, texts: plan.request.messages, isRequest: true, firstOnly: true }
    schedule('cast_dm', chatDelay(35, 50), request)
  }
  schedule('world_event', chatDelay(8, 12), { event: 'followers' })
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
