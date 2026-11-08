import { useState } from 'react'
import { Button, ConfirmDialog, toast } from '../../components'
import { api } from '../../lib/api'

/** "Start over": wipes the whole world on the server, then goes back to onboarding. Asks first. */
export function StartOver() {
  const [confirming, setConfirming] = useState(false)
  const [resetting, setResetting] = useState(false)

  async function reset() {
    setResetting(true)
    try {
      await api.reset()
      // A full page load gives a clean slate (the live "reset" event does the same in other open tabs).
      window.location.replace('/onboarding')
    } catch (error) {
      setResetting(false)
      toast(error instanceof Error ? error.message : "Couldn't start over. Try again.")
    }
  }

  return (
    <>
      <Button variant="danger" loading={resetting} onClick={() => setConfirming(true)}>
        Start over
      </Button>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={reset}
        title="Start over?"
        message="This deletes your profile, posts and chats, and everything your friends remember about you. It can't be undone."
        confirmLabel="Start over"
        danger
      />
    </>
  )
}
