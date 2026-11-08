import { User } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { Account } from '../../lib/types'

/** The person icon in the corner of a photo with tagged people; tapping it shows who is tagged. */
export function TaggedPeople({ accounts }: { accounts: Account[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-label={open ? 'Hide tags' : 'Show tagged people'}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
        className="absolute bottom-3 left-3 z-[5] grid size-7 place-items-center rounded-full bg-black/65 text-white transition hover:bg-black/80"
      >
        <User size={14} fill="currentColor" />
      </button>
      {open && (
        <div className="absolute inset-x-3 bottom-12 z-[5] flex flex-wrap gap-1.5">
          {accounts.map((account) => (
            <Link
              key={account.id}
              to={`/${account.username}`}
              onClick={(event) => event.stopPropagation()}
              className="rounded-md bg-black/75 px-2 py-1 text-xs font-semibold text-white hover:bg-black/90"
            >
              {account.username}
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
