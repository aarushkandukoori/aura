/**
 * "Here's your world": the plan to look over before building it. The summary, the people it picked
 * (plus friends who will join soon), the group chats, then what you can tweak: photo, name,
 * username, bio, interests and how popular you'll be.
 */
import { AnimatePresence, motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { Avatar, Button, TextArea, TextField } from '../../components'
import { cx } from '../../lib/cx'
import { TierCards } from '../settings/TierCards'
import { AvatarPicker } from './AvatarPicker'
import { InterestPicker } from './InterestPicker'
import { cleanUsername, MIN_INTERESTS, usernameError } from './options'
import { ChatList, PeopleRow } from './PlanPreview'
import type { StepProps } from './ProfileSteps'
import { StepTitle } from './StepTitle'

interface ReviewStepProps extends StepProps {
  /** true after "Build my world" was pressed with something missing. */
  showErrors: boolean
  /** The server's answer when the username was taken. */
  serverError: string | null
  /** The Google account's photo (the default profile picture), or null. */
  accountPicture: string | null
}

export function ReviewStep({ draft, update, showErrors, serverError, accountPicture }: ReviewStepProps) {
  const [touched, setTouched] = useState(false)
  const plan = draft.plan
  if (!plan) return null
  const localError = usernameError(draft.username)
  const usernameMessage = serverError ?? ((touched || showErrors) && localError ? localError : null)
  const picked = draft.interests.length
  const missingInterests = showErrors && picked < MIN_INTERESTS

  return (
    <>
      <StepTitle title="Here's your world" subtitle={plan.summary} />

      <Section index={0} title="Your people" note={`${plan.friends.length + plan.newFriends.length} people`}>
        <PeopleRow plan={plan} />
        {plan.newFriends.length > 0 && (
          <p className="mt-1 text-[12.5px] text-muted">
            We'll create {plan.newFriends.map((person) => person.name).join(' and ')} for you. They'll join in a few minutes.
          </p>
        )}
      </Section>

      <Section index={1} title="Group chats" note={`${plan.groupChats.length}`}>
        <ChatList plan={plan} />
      </Section>

      <Section index={2} title="You">
        <PhotoRow avatar={draft.avatar} accountPicture={accountPicture} onChange={(avatar) => update({ avatar })} />
        <div className="mt-5 grid gap-4">
          <TextField
            label="Name"
            placeholder="Your name"
            autoComplete="name"
            maxLength={40}
            value={draft.displayName}
            onChange={(event) => update({ displayName: event.target.value.slice(0, 40) })}
            error={showErrors && !draft.displayName.trim() ? 'Add your name.' : null}
          />
          <TextField
            label="Username"
            prefix="@"
            placeholder="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={draft.username}
            onChange={(event) => update({ username: cleanUsername(event.target.value), usernameEdited: true })}
            onBlur={() => setTouched(true)}
            error={usernameMessage}
            hint="Letters, numbers, dots and underscores."
          />
          <TextArea
            label="Bio"
            placeholder="A line about you ✨"
            maxLength={150}
            rows={2}
            value={draft.bio}
            onChange={(event) => update({ bio: event.target.value })}
          />
          <TextField
            label="Pronouns"
            placeholder="Optional"
            value={draft.pronouns}
            onChange={(event) => update({ pronouns: event.target.value.slice(0, 30) })}
          />
        </div>
      </Section>

      <Section
        index={3}
        title="What you're into"
        note={picked >= MIN_INTERESTS ? `${picked} picked` : `Pick ${MIN_INTERESTS - picked} more`}
        invalid={missingInterests}
      >
        <InterestPicker value={draft.interests} onChange={(interests) => update({ interests })} />
      </Section>

      <Section index={4} title="How popular do you want to be?">
        <TierCards value={draft.tier} onChange={(tier) => update({ tier })} />
      </Section>
    </>
  )
}

interface SectionProps {
  index: number
  title: string
  note?: string
  invalid?: boolean
  children: ReactNode
}

/** One part of the review, sliding up a moment after the one above it. */
function Section({ index, title, note, invalid = false, children }: SectionProps) {
  return (
    <motion.section
      data-invalid={invalid || undefined}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 + index * 0.08, duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
      className="mb-8"
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {note && <span className={cx('text-[13px]', invalid ? 'font-semibold text-danger' : 'text-muted')}>{note}</span>}
      </div>
      {children}
    </motion.section>
  )
}

/** The profile photo (the Google one by default) with a button that opens the full picker below. */
function PhotoRow({ avatar, accountPicture, onChange }: { avatar: string | null; accountPicture: string | null; onChange: (url: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const caption = !avatar ? "Add one so your friends know it's you." : avatar === accountPicture ? 'From your Google account' : 'Looking good.'
  return (
    <div>
      <div className="flex items-center gap-3.5">
        <Avatar src={avatar} size={64} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">Profile photo</p>
          <p className="text-[12.5px] text-muted">{caption}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setOpen(!open)}>
          {open ? 'Done' : avatar ? 'Change' : 'Add'}
        </Button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="pb-1 pt-6">
              <AvatarPicker value={avatar} onChange={onChange} previewSize={96} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
