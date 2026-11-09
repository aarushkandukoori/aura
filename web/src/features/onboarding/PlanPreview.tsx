/**
 * The plan's people and group chats on the review screen: a swipeable row of friend cards (with the
 * friends still to join at the end) and the group chats with their members.
 */
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Avatar, AvatarStack } from '../../components'
import { cx } from '../../lib/cx'
import { firstName } from '../../lib/format'
import type { Account, WorldPlan } from '../../lib/types'

/** Relationships are written with the user's first name; one without a name says "the user". */
const forYou = (text: string) => text.replace(/\bthe user's\b/gi, 'your').replace(/\bthe user\b/gi, 'you')

export function PeopleRow({ plan }: { plan: WorldPlan }) {
  return (
    // Bleeds to the screen edges so cards slide in from the side, like a stories tray.
    <div className="no-scrollbar -mx-6 flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-px-6 px-6 pb-2">
      {plan.friends.map((friend, index) => (
        <Card key={friend.id} index={index}>
          {friend.account ? (
            <Avatar src={friend.account.avatar} size={64} ring={friend.role === 'bestie' ? 'unseen' : undefined} />
          ) : (
            <Initial name={friend.id} />
          )}
          <p className="mt-2 w-full truncate text-[14px] font-semibold">{firstName(friend.account?.displayName ?? friend.id)}</p>
          <RolePill role={friend.role} />
          <p className="mt-2 line-clamp-4 text-[12px] leading-snug text-muted">{forYou(friend.relationship)}</p>
        </Card>
      ))}
      {plan.newFriends.map((person, index) => (
        <Card key={person.name} index={plan.friends.length + index} dashed>
          <Initial name={person.name} />
          <p className="mt-2 w-full truncate text-[14px] font-semibold">{person.name}</p>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">
            <span className="size-1.5 animate-pulse rounded-full bg-success" />
            Joining soon
          </span>
          <p className="mt-2 line-clamp-4 text-[12px] leading-snug text-muted">{forYou(person.description)}</p>
        </Card>
      ))}
    </div>
  )
}

function Card({ index, dashed = false, children }: { index: number; dashed?: boolean; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 18, stiffness: 220, delay: 0.12 + Math.min(index, 8) * 0.05 }}
      className={cx(
        'flex w-[148px] shrink-0 snap-start flex-col items-center rounded-2xl border bg-elevated px-3 pb-3.5 pt-4 text-center',
        dashed ? 'border-dashed border-line-strong' : 'border-line',
      )}
    >
      {children}
    </motion.div>
  )
}

function RolePill({ role }: { role: string }) {
  return role === 'bestie' ? (
    <span className="aura-gradient mt-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white">Bestie</span>
  ) : (
    <span className="mt-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">Friend</span>
  )
}

/** A soft aura circle with their first letter, for friends whose picture is still being drawn. */
function Initial({ name }: { name: string }) {
  return (
    <span className="aura-gradient grid size-16 place-items-center rounded-full text-[24px] font-bold text-white">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}

export function ChatList({ plan }: { plan: WorldPlan }) {
  const accounts = new Map(plan.friends.flatMap((friend) => (friend.account ? [[friend.id, friend.account] as const] : [])))
  return (
    <div className="grid gap-2">
      {plan.groupChats.map((group, index) => {
        const members = group.memberIds.flatMap((id) => accounts.get(id) ?? []) as Account[]
        return (
          <motion.div
            key={group.title}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 220, delay: 0.2 + index * 0.07 }}
            className="flex items-center gap-3 rounded-2xl border border-line px-3.5 py-3"
          >
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-surface text-[22px]">
              {group.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold">{group.title}</span>
              <span className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-muted">{group.vibe}</span>
            </span>
            <AvatarStack accounts={members} size={22} max={3} className="shrink-0" />
          </motion.div>
        )
      })}
    </div>
  )
}
