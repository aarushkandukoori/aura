/**
 * Edit profile (SPEC 9, screen 9, at /settings/profile): photo (upload or preset), name, username,
 * pronouns, bio and interests. Saves only what changed.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useGoBack } from '../../app/navigation'
import { Avatar, Button, PageHeader, Sheet, TextArea, TextField, toast } from '../../components'
import { api } from '../../lib/api'
import { useIsMobile } from '../../lib/hooks'
import { useMe, useStore } from '../../lib/store'
import type { Me, UpdateMeRequest } from '../../lib/types'
import { AvatarPicker } from '../onboarding/AvatarPicker'
import { InterestPicker } from '../onboarding/InterestPicker'
import { cleanUsername, usernameError } from '../onboarding/options'

interface Form {
  displayName: string
  username: string
  pronouns: string
  bio: string
  avatar: string | null
  interests: string[]
}

/** Only the fields that differ from my saved profile. */
function changedFields(form: Form, me: Me): UpdateMeRequest {
  const changes: UpdateMeRequest = {}
  if (form.displayName.trim() !== me.displayName) changes.displayName = form.displayName.trim()
  if (form.username !== me.username) changes.username = form.username
  if (form.pronouns.trim() !== me.pronouns) changes.pronouns = form.pronouns.trim()
  if (form.bio.trim() !== me.bio) changes.bio = form.bio.trim()
  if (form.avatar !== me.avatar) changes.avatar = form.avatar
  if (form.interests.join('|') !== me.interests.join('|')) changes.interests = form.interests
  return changes
}

export function EditProfilePage() {
  const me = useMe()
  const phone = useIsMobile()
  const navigate = useNavigate()
  const goBack = useGoBack(`/${me.username}`)
  const [form, setForm] = useState<Form>({
    displayName: me.displayName,
    username: me.username,
    pronouns: me.pronouns,
    bio: me.bio,
    avatar: me.avatar,
    interests: me.interests,
  })
  const [saving, setSaving] = useState(false)
  const [usernameTaken, setUsernameTaken] = useState<string | null>(null)
  const [choosingPhoto, setChoosingPhoto] = useState(false)

  const changes = changedFields(form, me)
  const dirty = Object.keys(changes).length > 0
  const usernameProblem = form.username === me.username ? null : usernameError(form.username)
  const valid = form.displayName.trim() !== '' && !usernameProblem && form.interests.length > 0
  const canSave = dirty && valid && !saving

  function update(patch: Partial<Form>) {
    setForm((current) => ({ ...current, ...patch }))
    if (patch.username !== undefined) setUsernameTaken(null)
  }

  async function save() {
    if (!canSave) return
    setSaving(true)
    try {
      const updated = await api.updateMe(changes)
      useStore.getState().setMe(updated)
      toast('Profile saved', { icon: '✨' })
      // A new username means a new profile address; otherwise go back to wherever you came from.
      if (updated.username !== me.username) navigate(`/${updated.username}`, { replace: true })
      else goBack()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't save your profile. Try again."
      if (/username/i.test(message)) setUsernameTaken(message)
      else toast(message)
      setSaving(false)
    }
  }

  const doneButton = (
    <button type="submit" form="edit-profile" disabled={!canSave} className="px-3 text-[15px] font-semibold text-accent disabled:opacity-40">
      {saving ? 'Saving...' : 'Done'}
    </button>
  )

  return (
    <div className="mx-auto w-full max-w-[640px] pb-16 md:px-6 md:pt-10">
      <PageHeader title="Edit profile" back={`/${me.username}`} right={doneButton} className="md:hidden" />
      <h1 className="hidden pb-6 text-2xl font-bold md:block">Edit profile</h1>

      <form
        id="edit-profile"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
        className="flex flex-col gap-6 px-4 pt-6 md:px-0 md:pt-0"
      >
        {phone ? (
          <div className="flex flex-col items-center gap-3">
            <Avatar src={form.avatar} size={92} />
            <button type="button" onClick={() => setChoosingPhoto(true)} className="text-sm font-semibold text-accent">
              Edit picture
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4 rounded-2xl bg-surface p-4">
            <Avatar src={form.avatar} size={56} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{form.username || me.username}</p>
              <p className="truncate text-muted">{form.displayName || me.displayName}</p>
            </div>
            <Button size="sm" onClick={() => setChoosingPhoto(true)}>
              Change photo
            </Button>
          </div>
        )}

        <TextField label="Name" value={form.displayName} onChange={(event) => update({ displayName: event.target.value.slice(0, 40) })} autoComplete="name" />
        <TextField
          label="Username"
          prefix="@"
          value={form.username}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => update({ username: cleanUsername(event.target.value) })}
          error={usernameTaken ?? usernameProblem}
        />
        <TextField label="Pronouns" placeholder="Optional" value={form.pronouns} onChange={(event) => update({ pronouns: event.target.value.slice(0, 30) })} />
        <TextArea label="Bio" placeholder="A line about you ✨" maxLength={150} rows={3} value={form.bio} onChange={(event) => update({ bio: event.target.value })} />

        <div>
          <h2 className="mb-1 text-[13px] font-semibold">Interests</h2>
          <p className="mb-3 text-xs text-muted">Your friends, Explore and suggestions use these.</p>
          <InterestPicker value={form.interests} onChange={(interests) => update({ interests })} />
          {form.interests.length === 0 && <p className="mt-2 text-xs text-danger">Pick at least one.</p>}
        </div>

        <div className="hidden justify-end gap-2 pt-2 md:flex">
          <Button variant="ghost" onClick={goBack}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSave} loading={saving}>
            Save
          </Button>
        </div>
      </form>

      <Sheet open={choosingPhoto} onClose={() => setChoosingPhoto(false)} title="Profile photo" size="md">
        <div className="flex flex-col items-center px-6 pb-6 pt-5">
          <AvatarPicker
            value={form.avatar}
            previewSize={112}
            onChange={(avatar) => {
              update({ avatar })
              setChoosingPhoto(false)
            }}
          />
          {form.avatar && (
            <button
              type="button"
              onClick={() => {
                update({ avatar: null })
                setChoosingPhoto(false)
              }}
              className="mt-6 text-sm font-semibold text-danger"
            >
              Remove current photo
            </button>
          )}
        </div>
      </Sheet>
    </div>
  )
}
