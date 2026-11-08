/**
 * The top of a profile: picture (with story ring), username, live counts, name, bio, "Followed by ...",
 * my aura chip and the action buttons. Desktop puts the picture beside everything; phones stack it.
 */
import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useOpenStoryComposer } from '../../app/navigation'
import { Avatar, AvatarStack, CountUp, LinkifiedText, VerifiedBadge } from '../../components'
import { formatCount, formatNumber } from '../../lib/format'
import { useAccount, useStore } from '../../lib/store'
import type { Profile } from '../../lib/types'
import { AuraChip } from './AuraChip'
import { ProfileActions } from './ProfileActions'
import { useFollowerCount } from './useProfile'

interface ProfileHeaderProps {
  profile: Profile
  isMe: boolean
  phone: boolean
}

export function ProfileHeader({ profile, isMe, phone }: ProfileHeaderProps) {
  const aura = useStore((s) => s.me?.aura ?? 0)

  if (phone) {
    return (
      <header className="px-4 pb-4 pt-4">
        <div className="flex items-center gap-5">
          <ProfilePicture profile={profile} isMe={isMe} size={84} />
          <div className="min-w-0 flex-1">
            <p className="mb-1.5 truncate text-[15px] font-semibold">{profile.displayName}</p>
            <Stats profile={profile} phone />
          </div>
        </div>
        <About profile={profile} showName={false} />
        {isMe && (
          <div className="mt-3">
            <AuraChip aura={aura} />
          </div>
        )}
        <div className="mt-4">
          <ProfileActions profile={profile} isMe={isMe} phone />
        </div>
      </header>
    )
  }

  return (
    <header className="flex items-start gap-8 px-4 pb-11 lg:gap-20 lg:px-12">
      <div className="flex w-[170px] shrink-0 justify-center lg:w-[230px]">
        <ProfilePicture profile={profile} isMe={isMe} size={150} />
      </div>
      <section className="min-w-0 flex-1 pt-1.5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <h1 className="flex min-w-0 items-center gap-1.5 text-xl">
            <span className="truncate">{profile.username}</span>
            {profile.verified && <VerifiedBadge size={18} />}
          </h1>
          <ProfileActions profile={profile} isMe={isMe} phone={false} />
        </div>
        <div className="mt-5">
          <Stats profile={profile} phone={false} />
        </div>
        <div className="mt-4">
          <About profile={profile} showName />
        </div>
        {isMe && (
          <div className="mt-4">
            <AuraChip aura={aura} />
          </div>
        )}
      </section>
    </header>
  )
}

/** My picture with no story gets a "+" that opens the story composer; otherwise the ring opens the story. */
function ProfilePicture({ profile, isMe, size }: { profile: Profile; isMe: boolean; size: number }) {
  const live = useAccount(profile)
  const openComposer = useOpenStoryComposer()
  if (!isMe || live.hasStory) return <Avatar account={profile} size={size} story />
  return (
    <button type="button" onClick={openComposer} aria-label="Add to your story" className="relative shrink-0 rounded-full transition active:scale-95">
      <Avatar account={profile} size={size} story />
      <span
        className="absolute grid place-items-center rounded-full bg-accent text-white ring-[3px] ring-bg"
        style={{ width: size * 0.28, height: size * 0.28, right: size * 0.06, bottom: size * 0.06 }}
      >
        <Plus size={size * 0.18} strokeWidth={3} />
      </span>
    </button>
  )
}

function Stats({ profile, phone }: { profile: Profile; phone: boolean }) {
  const followers = useFollowerCount(profile)
  const items: { label: string; value: number; href: string | null }[] = [
    { label: profile.postCount === 1 ? 'post' : 'posts', value: profile.postCount, href: null },
    { label: followers === 1 ? 'follower' : 'followers', value: followers, href: `/${profile.username}/followers` },
    { label: 'following', value: profile.following, href: `/${profile.username}/following` },
  ]
  const wrap = (href: string | null, children: ReactNode) =>
    href ? (
      <Link to={href} className="block hover:opacity-70">
        {children}
      </Link>
    ) : (
      children
    )

  if (phone) {
    return (
      <ul className="flex justify-between pr-2">
        {items.map((item) => (
          <li key={item.label} className="leading-tight">
            {wrap(
              item.href,
              <>
                <CountUp value={item.value} format={formatCount} className="block text-[17px] font-semibold" />
                <span className="text-[13px]">{item.label}</span>
              </>,
            )}
          </li>
        ))}
      </ul>
    )
  }
  return (
    <ul className="flex flex-wrap gap-x-10 gap-y-2 text-base">
      {items.map((item) => (
        <li key={item.label}>
          {wrap(
            item.href,
            <>
              <CountUp value={item.value} format={formatCount} className="font-semibold" /> <span className="text-muted">{item.label}</span>
            </>,
          )}
        </li>
      ))}
    </ul>
  )
}

function About({ profile, showName }: { profile: Profile; showName: boolean }) {
  const details = [profile.occupation, profile.location].filter(Boolean).join(' · ')
  return (
    <div className={showName ? 'text-sm leading-snug' : 'mt-3 text-sm leading-snug'}>
      {(showName || profile.pronouns) && (
        <p>
          {showName && <span className="font-semibold">{profile.displayName}</span>}
          {profile.pronouns && <span className={showName ? 'ml-2 text-muted' : 'text-muted'}>{profile.pronouns}</span>}
        </p>
      )}
      {details && <p className="text-muted">{details}</p>}
      {profile.bio && <LinkifiedText text={profile.bio} className="mt-0.5 block whitespace-pre-line" />}
      <FollowedBy profile={profile} />
    </div>
  )
}

/** "Followed by maya.chen, dev.k and 12 others": people I follow who follow them. */
function FollowedBy({ profile }: { profile: Profile }) {
  if (profile.isMe || profile.mutualCount === 0 || profile.mutuals.length === 0) return null
  const named = profile.mutuals.slice(0, 2)
  const others = profile.mutualCount - named.length
  return (
    <Link to={`/${profile.username}/followers`} className="mt-3 flex items-center gap-2 text-[13px] text-muted hover:opacity-80">
      <AvatarStack accounts={profile.mutuals} size={20} />
      <span className="min-w-0">
        Followed by{' '}
        {named.map((account, index) => (
          <span key={account.id}>
            {index > 0 && (others > 0 ? ', ' : ' and ')}
            <span className="font-semibold text-fg">{account.username}</span>
          </span>
        ))}
        {others > 0 && ` and ${formatNumber(others)} ${others === 1 ? 'other' : 'others'}`}
      </span>
    </Link>
  )
}
