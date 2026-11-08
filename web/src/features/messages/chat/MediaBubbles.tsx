/**
 * The picture parts of a message: a photo (or video), a post shared into the chat, and a story reply.
 * Each one opens on a single tap and reacts with a heart on a double tap.
 */
import { Clapperboard, Copy } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useOpenPost, useOpenStory } from '../../../app/navigation'
import { Avatar, Img, postThumbnail, Spinner, VerifiedBadge } from '../../../components'
import { cx } from '../../../lib/cx'
import { useDoubleTap } from '../../../lib/hooks'
import { useAccount } from '../../../lib/store'
import type { Account, Media, Message, Post } from '../../../lib/types'
import { isStoryReaction, storyReplyLabel } from '../preview'
import { PhotoViewer } from './PhotoViewer'

/** width / height kept between 2:3 (tall) and 3:2 (wide), so odd photos still make tidy bubbles. */
function bubbleRatio(width: number | null | undefined, height: number | null | undefined, fallback: number): number {
  if (!width || !height) return fallback
  return Math.min(1.5, Math.max(2 / 3, width / height))
}

/** A photo (or video) someone sent. Tap to see it full screen. */
export function PhotoBubble({ media, sending, onDoubleTap }: { media: Media; sending: boolean; onDoubleTap: () => void }) {
  const [viewing, setViewing] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const onTap = useDoubleTap(onDoubleTap, () => {
    if (loaded && !sending) setViewing(true)
  })
  const ratio = bubbleRatio(media.width, media.height, 4 / 5)

  if (media.type === 'video') {
    return (
      <video
        src={media.url}
        poster={media.poster ?? undefined}
        controls
        playsInline
        preload="metadata"
        className="w-[220px] rounded-[18px] bg-black md:w-[260px]"
        style={{ aspectRatio: String(ratio) }}
      />
    )
  }
  return (
    <>
      <button type="button" aria-label="Open photo" onClick={onTap} className="relative block w-[220px] overflow-hidden rounded-[18px] md:w-[260px]">
        <Img src={media.url} alt="Photo" ratio={ratio} className="w-full" onLoad={() => setLoaded(true)} />
        {sending && (
          <span className="absolute inset-0 grid place-items-center bg-black/30 text-white">
            <Spinner size={28} />
          </span>
        )}
      </button>
      {viewing && <PhotoViewer src={media.url} onClose={() => setViewing(false)} />}
    </>
  )
}

/** A post sent into the chat: author, picture and the start of the caption. Tap to open it. */
export function SharedPostCard({ post, onDoubleTap }: { post: Post; onDoubleTap: () => void }) {
  const openPost = useOpenPost()
  const navigate = useNavigate()
  const reel = post.kind === 'reel'
  const onTap = useDoubleTap(onDoubleTap, () => (reel ? navigate(`/reels/${post.id}`) : openPost(post.id)))
  const first = post.media[0]

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`Open ${reel ? 'reel' : 'post'} by ${post.author.username}`}
      className={cx('block overflow-hidden rounded-[18px] border border-line bg-surface text-left transition hover:brightness-[0.98]', reel ? 'w-[190px]' : 'w-[230px]')}
    >
      <span className="flex items-center gap-2 px-3 py-2.5">
        <Avatar account={post.author} size={26} />
        <span className="truncate text-[13px] font-semibold">{post.author.username}</span>
        {post.author.verified && <VerifiedBadge size={12} />}
      </span>
      <span className="relative block">
        <Img src={postThumbnail(post)} alt={post.caption || `Post by ${post.author.username}`} ratio={reel ? 9 / 14 : bubbleRatio(first?.width, first?.height, 4 / 5)} className="w-full" />
        {reel && <Clapperboard size={20} strokeWidth={2} className="absolute right-2.5 top-2.5 text-white drop-shadow-[0_1px_3px_rgb(0_0_0/0.5)]" />}
        {post.kind === 'carousel' && <Copy size={20} strokeWidth={2} className="absolute right-2.5 top-2.5 -scale-x-100 text-white drop-shadow-[0_1px_3px_rgb(0_0_0/0.5)]" />}
      </span>
      {post.caption && (
        // The padding lives on the outer span: a line-clamped box would show a third line in its padding.
        <span className="block px-3 py-2.5">
          <span className="line-clamp-2 text-[13px] leading-snug">
            <span className="font-semibold">{post.author.username}</span> {post.caption}
          </span>
        </span>
      )}
    </button>
  )
}

/** A day is the longest a story stays up, so older replies point at a story that is gone. */
const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000

interface StoryReplyProps {
  message: Message
  mine: boolean
  /** Whose story it was: theirs when I replied, mine when they did. */
  owner: Account
  onDoubleTap: () => void
}

/**
 * "Replied to your story" with the story's picture (and a big emoji for a story reaction).
 * The picture opens that person's stories while they are still up.
 */
export function StoryReply({ message, mine, owner, onDoubleTap }: StoryReplyProps) {
  const live = useAccount(owner)
  const openStory = useOpenStory()
  const stillUp = live.hasStory && Date.now() - message.createdAt < STORY_LIFETIME_MS
  const onTap = useDoubleTap(onDoubleTap, () => {
    if (stillUp) openStory(live.username)
  })
  const reaction = isStoryReaction(message)

  return (
    <div className={cx('flex flex-col', mine ? 'items-end' : 'items-start')}>
      <span className="mb-1.5 px-1 text-xs text-muted">{storyReplyLabel(message)}</span>
      <div className={cx('flex items-stretch gap-2', mine && 'flex-row-reverse')}>
        <span aria-hidden className="w-[3px] shrink-0 rounded-full bg-line-strong" />
        <span className="relative">
          <button
            type="button"
            onClick={onTap}
            aria-label={stillUp ? `View ${live.username}'s story` : 'Story'}
            className={cx('block w-[104px] overflow-hidden rounded-xl', !stillUp && 'cursor-default')}
          >
            <Img src={message.story?.thumb || null} alt="Story" ratio={9 / 16} className="w-full" />
          </button>
          {reaction && (
            <span aria-hidden className={cx('absolute -bottom-3 text-[34px] leading-none drop-shadow-[0_2px_6px_rgb(0_0_0/0.25)]', mine ? '-left-4' : '-right-4')}>
              {message.text.trim()}
            </span>
          )}
        </span>
      </div>
    </div>
  )
}
