import { Link } from 'react-router'
import { useOpenStory } from '../app/navigation'
import { cx } from '../lib/cx'
import { useStore } from '../lib/store'
import type { Account } from '../lib/types'
import { useImage } from '../lib/useImage'

interface AvatarProps {
  /** An account: gives the picture plus live story-ring state. */
  account?: Account | null
  /** Or just a picture URL (overrides the account's picture). */
  src?: string | null
  /** Picture diameter in px. With `story` or `ring`, the ring adds a few px around it. */
  size?: number
  /** Ring the avatar when the account has a story (animated aura = unseen, gray = seen); clicking opens it. */
  story?: boolean
  /** Force a ring, e.g. in the stories tray where every bubble has one. */
  ring?: 'unseen' | 'seen'
  /** Link to the profile (used when there is no story to open). */
  link?: boolean
  onClick?: () => void
  className?: string
}

/** Space the ring takes on each side: ring stroke + the gap between ring and picture. */
function ringParts(size: number) {
  return size >= 60 ? { stroke: 3, gap: 3 } : { stroke: 2, gap: 2 }
}

/**
 * A round profile picture. Examples:
 *   <Avatar account={post.author} size={32} story link />   post header: ring opens the story, else profile
 *   <Avatar src={me.avatar} size={150} />                   just the picture
 * Click priority: onClick, then the story (if any), then the profile link.
 */
export function Avatar({ account, src, size = 32, story = false, ring, link = false, onClick, className }: AvatarProps) {
  const cached = useStore((s) => (account ? s.accounts[account.id] : undefined))
  const person = account ? { ...account, ...cached } : null
  const openStory = useOpenStory()

  const ringState = ring ?? (story && person?.hasStory ? (person.storySeen ? 'seen' : 'unseen') : undefined)
  const reserveRing = story || Boolean(ring)
  const { stroke, gap } = ringParts(size)
  const outer = reserveRing ? size + 2 * (stroke + gap) : size
  const label = person ? `${person.username}'s profile picture` : 'Profile picture'

  const body = (
    <span
      className={cx('block rounded-full', ringState === 'unseen' && 'story-ring', ringState === 'seen' && 'story-ring-seen')}
      style={{ width: outer, height: outer, padding: ringState ? stroke : reserveRing ? stroke + gap : 0 }}
    >
      <span className={cx('block rounded-full', ringState && 'bg-bg')} style={{ padding: ringState ? gap : 0 }}>
        <AvatarImage src={src !== undefined ? src : person?.avatar ?? null} size={size} alt={label} />
      </span>
    </span>
  )

  const classes = cx('inline-block shrink-0 rounded-full', className)
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes} aria-label={person ? `Open ${person.username}` : 'Open'}>
        {body}
      </button>
    )
  }
  if (person && ringState && story && person.hasStory) {
    return (
      <button type="button" onClick={() => openStory(person.username)} className={classes} aria-label={`Open ${person.username}'s story`}>
        {body}
      </button>
    )
  }
  if (person && link) {
    return (
      <Link to={`/${person.username}`} className={classes} aria-label={`Go to ${person.username}'s profile`}>
        {body}
      </Link>
    )
  }
  return <span className={classes}>{body}</span>
}

/** The picture itself; a soft silhouette when there is none or it fails to load. */
function AvatarImage({ src, size, alt }: { src: string | null; size: number; alt: string }) {
  const image = useImage(src)
  return (
    <span className="relative block overflow-hidden rounded-full bg-surface-2" style={{ width: size, height: size }}>
      {image.status === 'loading' && <span aria-hidden className="shimmer absolute inset-0" />}
      {image.status === 'error' && <Silhouette />}
      {image.url && (
        <img
          src={image.url}
          alt={alt}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={image.onLoad}
          onError={image.onError}
          className={cx('absolute inset-0 size-full object-cover transition-opacity duration-300', image.status === 'loaded' ? 'opacity-100' : 'opacity-0')}
        />
      )}
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-black/5 dark:ring-white/10" />
    </span>
  )
}

function Silhouette() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden className="absolute inset-0 size-full text-muted opacity-45">
      <circle cx="20" cy="15.5" r="7" fill="currentColor" />
      <path d="M5.5 38c1.6-8 7.6-12.5 14.5-12.5S32.9 30 34.5 38z" fill="currentColor" />
    </svg>
  )
}

/** Overlapping small avatars in a row, e.g. next to "Liked by maya and 1,203 others". */
export function AvatarStack({ accounts, size = 20, max = 3, className }: { accounts: Account[]; size?: number; max?: number; className?: string }) {
  return (
    <span className={cx('flex items-center', className)}>
      {accounts.slice(0, max).map((account, index) => (
        <span key={account.id} className="rounded-full ring-2 ring-bg" style={{ marginLeft: index === 0 ? 0 : -size * 0.3, zIndex: max - index }}>
          <Avatar account={account} size={size} />
        </span>
      ))}
    </span>
  )
}

/** Two avatars offset diagonally: a group chat, or a notification from several people. */
export function AvatarPair({ first, second, size = 44, className }: { first: Account; second: Account; size?: number; className?: string }) {
  const small = Math.round(size * 0.72)
  return (
    <span className={cx('relative inline-block shrink-0', className)} style={{ width: size, height: size }}>
      <span className="absolute right-0 top-0">
        <Avatar account={first} size={small} />
      </span>
      <span className="absolute bottom-0 left-0 rounded-full ring-2 ring-bg">
        <Avatar account={second} size={small} />
      </span>
    </span>
  )
}
