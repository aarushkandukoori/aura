/**
 * One notification: avatar(s), the sentence and its time, and a post thumbnail or Follow back.
 * Clicking the row goes where the notification is about: the post, the person, or the chat.
 */
import { Sparkles } from 'lucide-react'
import type { MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useOpenPost } from '../../app/navigation'
import { Avatar, AvatarPair, FollowButton, Img, toast } from '../../components'
import { api } from '../../lib/api'
import { cx } from '../../lib/cx'
import { timeAgo } from '../../lib/format'
import { useStore } from '../../lib/store'
import type { Account, Notification } from '../../lib/types'
import { NotificationText } from './NotificationText'
import { useSecondFace } from './useSecondFace'

interface NotificationRowProps {
  notification: Notification
  /** Just arrived or just changed: glow for a moment. */
  highlight: boolean
  /** The desktop panel uses wider side padding. */
  compact: boolean
}

/** Clicks on the avatar, thumbnail or Follow button do their own thing, not the row's. */
const stop = (event: MouseEvent) => event.stopPropagation()

export function NotificationRow({ notification, highlight, compact }: NotificationRowProps) {
  const open = useOpenNotification(notification)
  const openPost = useOpenPost()
  const { kind, actor, postId, postThumb, createdAt } = notification
  const milestone = kind === 'milestone'

  return (
    <div
      onClick={open}
      className={cx(
        'flex cursor-pointer items-center gap-3 py-2 transition-colors',
        compact ? 'px-5' : 'px-3 md:px-4',
        highlight ? 'bg-accent-soft' : 'duration-1000 hover:bg-surface',
      )}
      style={milestone && !highlight ? MILESTONE_GLOW : undefined}
    >
      <span className="grid w-[52px] shrink-0 place-items-center" onClick={actor && !milestone ? stop : undefined}>
        <NotificationAvatar notification={notification} />
      </span>

      <button type="button" onClick={(event) => { stop(event); open() }} className="min-w-0 flex-1 text-left text-sm leading-snug">
        <span className="line-clamp-3 break-words">
          <NotificationText notification={notification} /> <time className="whitespace-nowrap text-muted">{timeAgo(createdAt)}</time>
        </span>
        {milestone && <span className="mt-0.5 block text-[13px] text-muted">Everyone's happy to see you ✨</span>}
      </button>

      {kind === 'follow' && actor ? (
        <span onClick={stop}>
          <FollowButton account={actor} />
        </span>
      ) : postId ? (
        <button type="button" aria-label="Open post" onClick={(event) => { stop(event); openPost(postId) }} className="shrink-0">
          <Img src={postThumb} alt="" className="size-11 rounded-md" />
        </button>
      ) : null}
    </div>
  )
}

/** A soft aura tint behind milestone rows. */
const MILESTONE_GLOW = {
  backgroundImage:
    'linear-gradient(90deg, color-mix(in oklab, var(--aura-1) 13%, transparent), color-mix(in oklab, var(--aura-2) 9%, transparent) 50%, color-mix(in oklab, var(--aura-4) 9%, transparent))',
}

function NotificationAvatar({ notification }: { notification: Notification }) {
  const second = useSecondFace(notification)
  const { kind, actor } = notification

  if (kind === 'milestone' || !actor) {
    return (
      <span className="aura-gradient grid size-11 place-items-center rounded-full text-white shadow-[0_2px_10px_rgb(155_123_255/0.35)]">
        <Sparkles size={22} strokeWidth={2} />
      </span>
    )
  }
  if (notification.others > 0) {
    return (
      <Link to={`/${actor.username}`} aria-label={`Go to ${actor.username}'s profile`}>
        {/* The actor in front (AvatarPair draws `second` on top); behind them another real face
            when we know one, else a plain silhouette. */}
        <AvatarPair first={second ?? silhouette(actor)} second={actor} size={44} />
      </Link>
    )
  }
  return <Avatar account={actor} size={44} story link />
}

/** A stand-in account with no picture (Avatar draws a silhouette) for "and N others". */
function silhouette(actor: Account): Account {
  return { ...actor, id: `${actor.id}:others`, username: 'others', avatar: null, hasStory: false }
}

/** Where a notification leads when tapped. */
function useOpenNotification(notification: Notification): () => void {
  const navigate = useNavigate()
  const openPost = useOpenPost()
  const myUsername = useStore((s) => s.me?.username)
  const { kind, actor, postId } = notification

  // A story reaction is answered in your chat with that person.
  async function openChat(person: Account) {
    try {
      const conversation = await api.createConversation({ memberIds: [person.id] })
      useStore.getState().upsertConversation(conversation)
      navigate(`/messages/${conversation.id}`)
    } catch {
      toast("Couldn't open that chat. Try again.")
    }
  }

  return () => {
    if (kind === 'milestone') navigate(`/${myUsername}`)
    else if (kind === 'follow' && actor) navigate(`/${actor.username}`)
    else if (kind === 'story_reaction' && actor) openChat(actor)
    else if (postId) openPost(postId)
    else if (actor) navigate(`/${actor.username}`)
  }
}
