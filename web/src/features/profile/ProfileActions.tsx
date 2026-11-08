/**
 * The buttons under a profile: Edit profile + Share profile on mine; Follow + Message on others,
 * plus the ⋯ menu for other people's profiles.
 */
import { Link2, MessageCircle, Settings, UserMinus, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button, buttonClasses, FollowButton, Menu, toast, type MenuItem } from '../../components'
import { api } from '../../lib/api'
import { copyLink } from '../../lib/clipboard'
import { cx } from '../../lib/cx'
import { useAccount, useStore } from '../../lib/store'
import type { Profile } from '../../lib/types'

/** Copy a link to this profile (shows the link instead when the clipboard isn't available). */
export function copyProfileLink(username: string) {
  return copyLink(`/${username}`, 'Profile link copied', '🔗')
}

/** Opens (or starts) my DM with this person. */
export function useMessage(profile: Profile) {
  const navigate = useNavigate()
  const [opening, setOpening] = useState(false)
  async function message() {
    setOpening(true)
    try {
      const conversation = await api.createConversation({ memberIds: [profile.id] })
      useStore.getState().upsertConversation(conversation)
      navigate(`/messages/${conversation.id}`)
    } catch {
      toast("Couldn't open the chat. Try again.")
      setOpening(false)
    }
  }
  return { message, opening }
}

interface ProfileActionsProps {
  profile: Profile
  isMe: boolean
  /** Phones stretch the buttons across the screen. */
  phone: boolean
}

export function ProfileActions({ profile, isMe, phone }: ProfileActionsProps) {
  const { message, opening } = useMessage(profile)

  if (isMe) {
    return (
      <div className={cx('flex items-center gap-2', phone && 'w-full')}>
        <Link to="/settings/profile" className={cx(buttonClasses({ variant: 'secondary' }), phone && 'flex-1')}>
          Edit profile
        </Link>
        <Button variant="secondary" className={phone ? 'flex-1' : undefined} onClick={() => copyProfileLink(profile.username)}>
          Share profile
        </Button>
        {!phone && (
          <Link to="/settings" aria-label="Settings" title="Settings" className="grid size-10 place-items-center rounded-full hover:bg-surface">
            <Settings size={22} strokeWidth={1.75} />
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className={cx('flex items-center gap-2', phone && 'w-full')}>
      <FollowButton account={profile} size="md" className={phone ? 'flex-1' : 'min-w-[104px]'} />
      <Button variant="secondary" className={phone ? 'flex-1' : undefined} loading={opening} onClick={message}>
        Message
      </Button>
      {!phone && <ProfileMenu profile={profile} />}
    </div>
  )
}

/** ⋯ on someone else's profile. */
export function ProfileMenu({ profile, className }: { profile: Profile; className?: string }) {
  const live = useAccount(profile)
  const { message } = useMessage(profile)
  const items: MenuItem[] = [
    { label: 'Copy profile link', icon: <Link2 size={18} />, onSelect: () => copyProfileLink(profile.username) },
    { label: 'Send message', icon: <MessageCircle size={18} />, onSelect: message },
    live.iFollow
      ? { label: 'Unfollow', icon: <UserMinus size={18} />, danger: true, onSelect: () => useStore.getState().unfollow(live) }
      : { label: live.followsMe ? 'Follow back' : 'Follow', icon: <UserPlus size={18} />, onSelect: () => useStore.getState().follow(live) },
  ]
  return <Menu items={items} label="Profile options" className={className} />
}
