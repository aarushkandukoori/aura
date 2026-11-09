import { useState } from 'react'
import { Button, Img, toast } from '../../components'
import { useStore } from '../../lib/store'

/** Settings row: "Signed in as you@gmail.com" with a Sign out button. Nothing in local mode (no sign-in). */
export function SignedInRow() {
  const account = useStore((s) => s.account)
  const signOut = useStore((s) => s.signOut)
  const [leaving, setLeaving] = useState(false)
  if (!account) return null

  async function leave() {
    setLeaving(true)
    try {
      await signOut()
    } catch (error) {
      setLeaving(false)
      toast(error instanceof Error ? error.message : "Couldn't sign out. Try again.")
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl p-3">
      {account.picture ? (
        <Img src={account.picture} alt="" className="size-[52px] shrink-0 rounded-full" />
      ) : (
        <span aria-hidden className="grid size-[52px] shrink-0 place-items-center rounded-full bg-surface text-lg font-semibold uppercase">
          {account.name.slice(0, 1)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-muted">Signed in as</span>
        <span className="block truncate font-semibold">{account.email}</span>
      </span>
      <Button variant="secondary" size="sm" loading={leaving} onClick={leave}>
        Sign out
      </Button>
    </div>
  )
}
