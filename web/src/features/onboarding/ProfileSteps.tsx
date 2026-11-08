/**
 * Onboarding steps about the person: name + username + pronouns, a profile photo, bio + interests.
 */
import { useState } from 'react'
import { TextArea, TextField } from '../../components'
import { cx } from '../../lib/cx'
import { AvatarPicker } from './AvatarPicker'
import type { Draft } from './draft'
import { InterestPicker } from './InterestPicker'
import { cleanUsername, MIN_INTERESTS, PRONOUNS, suggestUsername, usernameError } from './options'
import { StepTitle } from './StepTitle'

export interface StepProps {
  draft: Draft
  update: (changes: Partial<Draft>) => void
}

interface NameStepProps extends StepProps {
  /** true after the person pressed Next with something missing. */
  showErrors: boolean
  /** The server's answer when the username was taken. */
  serverError: string | null
}

export function NameStep({ draft, update, showErrors, serverError }: NameStepProps) {
  // Username mistakes show once the person leaves the field (or presses Next), not on the first keystroke.
  const [touched, setTouched] = useState(false)
  const localError = usernameError(draft.username)
  const usernameMessage = serverError ?? ((touched || showErrors) && draft.username !== '' ? localError : null)

  function changeName(displayName: string) {
    const name = displayName.slice(0, 40)
    update(draft.usernameEdited ? { displayName: name } : { displayName: name, username: suggestUsername(name) })
  }

  return (
    <>
      <StepTitle title="What should we call you?" subtitle="This is how you'll show up for everyone." />
      <div className="flex flex-col gap-5">
        <TextField
          label="Name"
          placeholder="Your name"
          autoFocus={!serverError}
          autoComplete="name"
          value={draft.displayName}
          onChange={(event) => changeName(event.target.value)}
          error={showErrors && !draft.displayName.trim() ? 'Add your name.' : null}
        />
        <TextField
          label="Username"
          prefix="@"
          placeholder="username"
          autoFocus={Boolean(serverError)} // back here because the name was taken: fix it right away
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={draft.username}
          onChange={(event) => update({ username: cleanUsername(event.target.value), usernameEdited: true })}
          onBlur={() => setTouched(true)}
          error={usernameMessage ?? (showErrors && draft.username === '' ? 'Pick a username.' : null)}
          hint="Letters, numbers, dots and underscores."
        />
        <div>
          <TextField
            label="Pronouns"
            placeholder="Optional"
            value={draft.pronouns}
            onChange={(event) => update({ pronouns: event.target.value.slice(0, 30) })}
          />
          <div className="mt-2.5 flex flex-wrap gap-2">
            {PRONOUNS.map((pronouns) => {
              const selected = draft.pronouns === pronouns
              return (
                <button
                  key={pronouns}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => update({ pronouns: selected ? '' : pronouns })}
                  className={cx(
                    'h-9 rounded-full border px-3.5 text-[13px] transition active:scale-95',
                    selected ? 'border-accent bg-accent-soft font-semibold' : 'border-line hover:bg-surface',
                  )}
                >
                  {pronouns}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}

export function PhotoStep({ draft, update }: StepProps) {
  return (
    <>
      <StepTitle title="Add a profile photo" subtitle="So your friends know it's you. You can change it anytime." />
      <AvatarPicker value={draft.avatar} onChange={(avatar) => update({ avatar })} />
    </>
  )
}

export function AboutStep({ draft, update }: StepProps) {
  const picked = draft.interests.length
  const enough = picked >= MIN_INTERESTS
  return (
    <>
      <StepTitle title="Tell everyone about you" subtitle="This shows on your profile. Your friends will notice." />
      <TextArea
        label="Bio"
        placeholder="A line about you ✨"
        maxLength={150}
        rows={3}
        value={draft.bio}
        onChange={(event) => update({ bio: event.target.value })}
      />
      <div className="mb-3 mt-7 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">What are you into?</h2>
        <span className={cx('text-[13px]', enough ? 'font-semibold text-success' : 'text-muted')}>
          {enough ? `${picked} picked` : `Pick ${MIN_INTERESTS - picked} more`}
        </span>
      </div>
      <InterestPicker value={draft.interests} onChange={(interests) => update({ interests })} />
    </>
  )
}
