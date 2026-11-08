/**
 * The user's comments: on a character's post the author hearts it and usually answers; when the
 * user replies to a character on their own post, that person usually answers back; anyone
 * @mentioned answers too; and a few others like the comment.
 */
import { replyToComment } from '../ai/tasks.ts'
import {
  addComment, bumpAura, getAccountByUsername, getAccountRow, getCast, getCastMember, getCommentRow, getComments,
  getVisiblePostRow, randomCrowdIds,
} from '../repo/index.ts'
import { chance, randomBetween, randomInt, sample } from '../repo/random.ts'
import { describePost, firstNameOf, isClose, short, userInfo } from './context.ts'
import { AURA } from './curve.ts'
import { postOwnerLabel } from './posts.ts'
import { schedule } from './scheduler.ts'
import { chatDelay, simDelay } from './time.ts'

/** Usernames @mentioned in a comment. */
function mentionedUsernames(text: string): string[] {
  return [...text.matchAll(/@([a-z0-9._]+)/gi)].map((match) => match[1].replace(/\.$/, '').toLowerCase())
}

/** Job user_comment: plan the reactions to a comment the user just wrote. */
export function reactToMyComment({ commentId }: { commentId: string }): void {
  const comment = getCommentRow(commentId)
  const post = comment ? getVisiblePostRow(comment.post_id) : undefined
  if (!comment || !post || comment.author_id !== 'me') return
  const parent = comment.parent_id ? getCommentRow(comment.parent_id) : undefined
  const repliers = new Set<string>()

  if (post.author_id !== 'me') {
    // On a character's post: the author hearts it soon, and usually answers.
    const author = getCastMember(post.author_id)
    schedule('comment_likes', simDelay(randomBetween(0.5, 3)), { commentId, likerIds: [post.author_id], byAuthor: true })
    if (author && chance(author.role === 'creator' ? 0.5 : 0.85)) repliers.add(author.id)
  } else if (parent && getCastMember(parent.author_id) && chance(0.75)) {
    // Answering a character on my own post: they usually answer back, and often heart my reply.
    repliers.add(parent.author_id)
    if (chance(0.6)) schedule('comment_likes', simDelay(randomBetween(0.3, 2)), { commentId, likerIds: [parent.author_id] })
  }
  for (const username of mentionedUsernames(comment.text)) {
    const account = getAccountByUsername(username)
    if (account?.kind === 'cast') repliers.add(account.id)
  }
  for (const replierId of repliers) schedule('comment_reply', chatDelay(8, 40), { commentId, replierId })

  // A few other people like it.
  // Nobody likes the same comment twice: the author and the person answered may have hearted it above.
  const others = getCast().filter((member) => isClose(member) && member.id !== post.author_id && member.id !== parent?.author_id)
  const friends = sample(others, randomInt(0, 2))
  const likerIds = [...friends.map((member) => member.id), ...randomCrowdIds(randomInt(0, 4), { followingMe: true })]
  if (likerIds.length > 0) schedule('comment_likes', simDelay(randomBetween(1, 10)), { commentId, likerIds })
}

/** Job comment_reply: a character answers a comment, in their voice (AI at chat speed, or templates). */
export async function answerComment({ commentId, replierId }: { commentId: string; replierId: string }): Promise<void> {
  const comment = getCommentRow(commentId)
  const post = comment ? getVisiblePostRow(comment.post_id) : undefined
  const replier = getCastMember(replierId)
  const commenter = comment ? getAccountRow(comment.author_id) : undefined
  const user = userInfo()
  if (!comment || !post || !replier || !commenter || !user) return

  // The thread this comment belongs to: its top-level comment and the replies under it.
  const topId = comment.parent_id ?? comment.id
  const top = getComments(post.id).find((item) => item.id === topId)
  const nameOf = (author: { kind: string; displayName: string }) => (author.kind === 'me' ? user.firstName : firstNameOf(author.displayName))
  const thread = top ? [top, ...top.replies].map((item) => ({ name: nameOf(item.author), text: item.text })) : []

  const { text } = await replyToComment({
    user,
    replier,
    postOwner: postOwnerLabel(post, user.firstName),
    post: `caption "${short(post.caption, 300)}", showing ${describePost(post)}`,
    thread,
    replyingTo: { name: commenter.kind === 'me' ? user.firstName : firstNameOf(commenter.display_name), text: comment.text },
  })
  const reply = addComment({ postId: post.id, authorId: replier.id, text: `@${commenter.username} ${text}`, parentId: comment.id })
  if (reply && post.author_id === 'me') bumpAura(AURA.perComment)
}
