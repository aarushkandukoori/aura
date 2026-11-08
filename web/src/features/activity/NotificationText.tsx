import type { ReactNode } from 'react'
import { CountUp } from '../../components'
import { useStore } from '../../lib/store'
import type { Notification } from '../../lib/types'

const Bold = ({ children }: { children: ReactNode }) => <strong className="font-semibold">{children}</strong>

/**
 * The sentence for a notification, with names in bold:
 * "maya and 2,312 others liked your reel." · "dev commented: so good" · "You hit 50K followers 🎉"
 * The "others" number rolls up when a merged notification grows live.
 */
export function NotificationText({ notification }: { notification: Notification }) {
  const { kind, actor, others, text, postId } = notification
  const postKind = useStore((s) => (postId ? s.posts[postId]?.kind : undefined))
  const thing = postKind === 'reel' ? 'reel' : 'post'

  const name = actor ? <Bold>{actor.username}</Bold> : <Bold>Someone</Bold>
  const people =
    others > 0 ? (
      <>
        {name} and{' '}
        <Bold>
          <CountUp value={others} /> {others === 1 ? 'other' : 'others'}
        </Bold>
      </>
    ) : (
      name
    )

  switch (kind) {
    case 'like':
      return <>{people} liked your {thing}.</>
    case 'follow':
      return <>{people} started following you.</>
    case 'comment':
      return <>{name} commented: {text}</>
    case 'reply':
      return <>{name} replied to your comment: {text}</>
    case 'mention':
      return <>{name} mentioned you in a comment: {text}</>
    case 'comment_like':
      return <>{people} liked your comment: {text}</>
    case 'story_reaction':
      return <>{name} reacted to your story {text}</>
    case 'tag':
      return <>{name} tagged you in a {thing}.</>
    case 'milestone':
      return <Bold>{text || 'You reached a new milestone 🎉'}</Bold>
    default:
      return <>{name} {text}</>
  }
}
