/**
 * The text over the bottom of a reel: who posted it (with Follow), the caption (tap "more" to
 * read it all) and a scrolling ticker with the audio name.
 */
import { EighthNote } from 'lucide-react'
import { motion } from 'motion/react'
import { useLayoutEffect, useRef, useState } from 'react'
import { Avatar, LinkifiedText, UsernameLink } from '../../components'
import { cx } from '../../lib/cx'
import { useAccount, useStore } from '../../lib/store'
import type { Account, Post } from '../../lib/types'

interface ReelOverlayProps {
  post: Post
  /** The ticker only scrolls on the reel that is playing. */
  running: boolean
  /** Fade out while the reel is held (to look at the picture). */
  hidden: boolean
  /** Phones leave room on the right for the action buttons. */
  besideRail: boolean
}

export function ReelOverlay({ post, running, hidden, besideRail }: ReelOverlayProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    // `dark` gives links and text the dark-theme colors, since this always sits on a photo.
    <div
      className={cx(
        'dark pointer-events-none absolute inset-x-0 bottom-0 z-10 text-white transition-opacity duration-200',
        hidden && 'opacity-0',
      )}
    >
      <div
        className={cx(
          'bg-linear-to-t to-transparent px-4 pb-6 pt-28',
          // A deeper shade behind a long, expanded caption.
          expanded ? 'from-black/90 via-black/65' : 'from-black/75 via-black/35',
          besideRail && 'pr-[72px]',
        )}
      >
        <div className="pointer-events-auto flex min-w-0 items-center gap-2.5">
          <Avatar account={post.author} size={32} story link />
          <UsernameLink account={post.author} className="text-sm text-white" badgeSize={13} />
          <ReelFollowButton account={post.author} />
        </div>

        {post.caption && <Caption text={post.caption} expanded={expanded} onToggle={() => setExpanded((open) => !open)} />}

        {post.audio && <AudioTicker audio={post.audio} running={running} />}
      </div>
    </div>
  )
}

/** Follow is offered for people you didn't follow when the reel came up; after a tap it reads "Following". */
function ReelFollowButton({ account }: { account: Account }) {
  const live = useAccount(account)
  const follow = useStore((s) => s.follow)
  const [offered] = useState(!live.iFollow)
  if (!offered || live.kind === 'me') return null
  return (
    <button
      type="button"
      disabled={live.iFollow}
      onClick={() => follow(live)}
      className="shrink-0 rounded-lg border border-white/70 px-3 py-1 text-[13px] font-semibold text-white transition hover:bg-white/10 disabled:border-white/30 disabled:text-white/70"
    >
      {live.iFollow ? 'Following' : live.followsMe ? 'Follow back' : 'Follow'}
    </button>
  )
}

function Caption({ text, expanded, onToggle }: { text: string; expanded: boolean; onToggle: () => void }) {
  const line = useRef<HTMLDivElement>(null)
  const [overflows, setOverflows] = useState(false)

  // Only offer "more" when the caption really doesn't fit on one line.
  useLayoutEffect(() => {
    const element = line.current
    if (element) setOverflows(element.scrollHeight > element.clientHeight + 1)
  }, [text, expanded])

  if (expanded) {
    return (
      <div onClick={onToggle} className="no-scrollbar pointer-events-auto mt-2.5 max-h-[38dvh] cursor-pointer overflow-y-auto whitespace-pre-line text-sm leading-snug">
        <LinkifiedText text={text} /> <span className="font-semibold text-white/70">less</span>
      </div>
    )
  }
  return (
    <div onClick={overflows ? onToggle : undefined} className={cx('pointer-events-auto mt-2.5 flex items-baseline gap-1.5 text-sm leading-snug', overflows && 'cursor-pointer')}>
      <div ref={line} className="line-clamp-1 min-w-0 flex-1">
        <LinkifiedText text={text} />
      </div>
      {overflows && (
        <button type="button" className="shrink-0 font-semibold text-white/70">
          more
        </button>
      )}
    </div>
  )
}

function AudioTicker({ audio, running }: { audio: string; running: boolean }) {
  return (
    <div className="mt-3 flex w-fit max-w-[75%] items-center gap-1.5 rounded-full bg-white/15 py-1 pl-2.5 pr-3 text-[13px] backdrop-blur-sm">
      <EighthNote size={13} className="shrink-0" />
      <div className="min-w-0 overflow-hidden">
        {/* Two copies side by side; sliding left by half loops without a jump. */}
        <motion.div
          className="flex w-max whitespace-nowrap"
          animate={running ? { x: ['0%', '-50%'] } : { x: '0%' }}
          transition={running ? { duration: Math.max(7, audio.length * 0.3), ease: 'linear', repeat: Infinity } : { duration: 0 }}
        >
          <span className="pr-10">{audio}</span>
          <span aria-hidden className="pr-10">{audio}</span>
        </motion.div>
      </div>
    </div>
  )
}
