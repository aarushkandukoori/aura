/**
 * The user following and liking: people follow back (creators only sometimes), fans and mutuals
 * may say thanks, and a liked post makes its author feel a little closer.
 */
import { now } from '../db/index.ts'
import { bumpCloseness, followBack, getAccountRow, getCastMember, getVisiblePostRow } from '../repo/index.ts'
import { chance } from '../repo/random.ts'
import { dmOpenerAllowed, startDm } from './chats.ts'
import { isClose } from './context.ts'
import { creatorBanner } from './posts.ts'

const HOUR = 60 * 60 * 1000

/** Job user_follow: someone the user just followed follows back, and fans or mutuals may say thanks. */
export async function followedByUser({ accountId }: { accountId: string }): Promise<void> {
  const account = getAccountRow(accountId)
  if (!account || account.kind === 'me' || account.i_follow !== 1) return // unfollowed again in the meantime
  const member = getCastMember(accountId)
  if (account.follows_me !== 1) {
    // Creators are picky; everyone else follows back.
    if (member?.role === 'creator' && !chance(0.55)) return
    followBack(accountId)
    if (member?.role === 'creator') creatorBanner(member, 'followed you back', `/${member.username}`)
  }
  // The same limit as every unprompted DM, so following and unfollowing can't set off a string of thank-yous.
  if (member && (member.role === 'fan' || member.role === 'mutual') && chance(0.45) && dmOpenerAllowed()) {
    await startDm(member, 'followed')
  }
}

/** Job user_liked: the user liked a character's post. Sometimes a friend says something about it. */
export async function likedByUser({ postId }: { postId: string }): Promise<void> {
  const post = getVisiblePostRow(postId)
  const author = post ? getCastMember(post.author_id) : null
  if (!post || !author) return
  bumpCloseness(author.id, 0.005)
  const fresh = now() - post.created_at < 2 * HOUR
  if (fresh && isClose(author) && chance(0.12) && dmOpenerAllowed()) await startDm(author, 'liked-post')
}
