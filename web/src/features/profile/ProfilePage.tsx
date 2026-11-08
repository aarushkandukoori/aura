/**
 * A profile page (SPEC 9, screen 8), mine or anyone's: /:username, /:username/reels, /:username/tagged,
 * and /:username?tab=saved on mine.
 */
import { ChevronLeft, Menu as MenuIcon, SquarePlus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { useGoBack, useOpenCreate } from '../../app/navigation'
import { Button, IconButton, NotFound, Skeleton, VerifiedBadge } from '../../components'
import { useIsMobile } from '../../lib/hooks'
import type { Profile } from '../../lib/types'
import { Highlights } from './Highlights'
import { ProfileMenu } from './ProfileActions'
import { ProfileHeader } from './ProfileHeader'
import { GridSkeleton, ProfileGrid, ProfileTabs, tabFromLocation } from './ProfilePosts'
import { useProfile } from './useProfile'

export function ProfilePage() {
  const { username = '' } = useParams()
  const { pathname, search } = useLocation()
  const phone = useIsMobile()
  const { profile, isMe, error, retry } = useProfile(username)
  const tab = tabFromLocation(pathname, search, isMe)

  if (error === 404) return <NotFound />
  if (!profile) {
    if (!error) return <ProfileSkeleton />
    return (
      <div className="flex flex-col items-center gap-3 px-8 py-24 text-center">
        <h1 className="text-xl font-bold">Couldn't load this profile</h1>
        <p className="text-sm text-muted">Check your connection and try again.</p>
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[935px] pb-12 md:px-5 md:pt-9">
      {phone && <PhoneTopBar profile={profile} isMe={isMe} />}
      <ProfileHeader profile={profile} isMe={isMe} phone={phone} />
      <Highlights highlights={profile.highlights} phone={phone} />
      <ProfileTabs username={profile.username} tab={tab} isMe={isMe} />
      <ProfileGrid username={profile.username} tab={tab} isMe={isMe} />
    </div>
  )
}

/** Phones: username in the middle; mine has Create and Settings, others have Back and ⋯. */
function PhoneTopBar({ profile, isMe }: { profile: Profile; isMe: boolean }) {
  const openCreate = useOpenCreate()
  const goBack = useGoBack('/')
  let left: ReactNode
  let right: ReactNode
  if (isMe) {
    left = (
      <IconButton label="New post" onClick={openCreate}>
        <SquarePlus size={25} strokeWidth={1.75} />
      </IconButton>
    )
    right = (
      <Link to="/settings" aria-label="Settings" className="grid size-10 place-items-center rounded-full active:opacity-60">
        <MenuIcon size={26} strokeWidth={1.75} />
      </Link>
    )
  } else {
    left = (
      <IconButton label="Back" onClick={goBack}>
        <ChevronLeft size={28} strokeWidth={1.75} />
      </IconButton>
    )
    right = <ProfileMenu profile={profile} />
  }
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 pt-safe backdrop-blur-xl">
      <div className="grid h-12 grid-cols-[56px_1fr_56px] items-center px-1">
        <div>{left}</div>
        <h1 className="flex min-w-0 items-center justify-center gap-1 text-base font-semibold">
          <span className="truncate">{profile.username}</span>
          {profile.verified && <VerifiedBadge size={14} />}
        </h1>
        <div className="flex justify-end">{right}</div>
      </div>
    </header>
  )
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[935px] md:px-5 md:pt-9">
      <div className="flex items-center gap-6 px-4 py-5 md:gap-20 md:px-12 md:pb-11">
        <Skeleton circle className="size-[84px] shrink-0 md:size-[150px]" />
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64 max-w-full" />
          <Skeleton className="h-4 w-52 max-w-full" />
        </div>
      </div>
      <GridSkeleton />
    </div>
  )
}
