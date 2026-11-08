/**
 * "Tag people" and "Add location" rows of the new-post form.
 * Tagging searches every account; people you follow (closest friends first) are suggested before you type.
 */
import { Check, ChevronDown, MapPin, UserPlus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AvatarStack, UserRow } from '../../components'
import { api } from '../../lib/api'
import { cx } from '../../lib/cx'
import { useDebouncedValue } from '../../lib/hooks'
import { useMe } from '../../lib/store'
import type { Account } from '../../lib/types'

const MAX_TAGS = 20 // the server's limit

export function TagPeople({ tagged, onChange }: { tagged: Account[]; onChange: (accounts: Account[]) => void }) {
  const me = useMe()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const search = useDebouncedValue(query.trim(), 250)
  const [results, setResults] = useState<{ query: string; accounts: Account[] }>({ query: '', accounts: [] })
  const [suggested, setSuggested] = useState<Account[] | null>(null)

  // Suggestions load the first time the section opens.
  useEffect(() => {
    if (!open || suggested) return
    api.following(me.username)
      .then((list) => setSuggested(list.accounts.slice(0, 8)))
      .catch(() => setSuggested([]))
  }, [open, suggested, me.username])

  useEffect(() => {
    if (!search) return
    let cancelled = false
    api.search(search)
      .then((result) => {
        if (!cancelled) setResults({ query: search, accounts: result.accounts.filter((account) => account.kind !== 'me').slice(0, 8) })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [search])

  const list = search ? (results.query === search ? results.accounts : []) : suggested ?? []
  const taggedIds = new Set(tagged.map((account) => account.id))

  function toggle(account: Account) {
    if (taggedIds.has(account.id)) onChange(tagged.filter((person) => person.id !== account.id))
    else if (tagged.length < MAX_TAGS) onChange([...tagged, account])
  }

  return (
    <div className="border-t border-line">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex h-12 w-full items-center gap-3 px-4 hover:bg-surface">
        <UserPlus size={20} strokeWidth={1.75} />
        <span className="flex-1 text-left text-[15px]">{tagged.length > 0 ? `${tagged.length} tagged` : 'Tag people'}</span>
        {tagged.length > 0 && <AvatarStack accounts={tagged} size={22} />}
        <ChevronDown size={18} className={cx('text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="pb-2">
          {tagged.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 pb-2">
              {tagged.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => toggle(account)}
                  aria-label={`Remove ${account.username}`}
                  className="inline-flex h-7 items-center gap-1 rounded-full bg-accent-soft pl-2.5 pr-1.5 text-[13px] font-semibold"
                >
                  {account.username}
                  <X size={13} />
                </button>
              ))}
            </div>
          )}
          <div className="px-4">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search people"
              aria-label="Search people to tag"
              className="h-9 w-full rounded-lg bg-surface px-3 text-sm outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/25"
            />
          </div>
          {!search && list.length > 0 && <p className="px-4 pb-1 pt-3 text-xs font-semibold text-muted">Suggested</p>}
          <div className="pt-1">
            {list.map((account) => (
              <UserRow
                key={account.id}
                account={account}
                size={36}
                story={false}
                onClick={() => toggle(account)}
                right={taggedIds.has(account.id) ? <Check size={18} className="text-accent" /> : null}
              />
            ))}
            {search && results.query === search && list.length === 0 && <p className="px-4 py-3 text-sm text-muted">No one found for "{search}".</p>}
          </div>
        </div>
      )}
    </div>
  )
}

export function LocationField({ value, onChange }: { value: string; onChange: (location: string) => void }) {
  return (
    <div className="flex h-12 items-center gap-3 border-t border-line px-4">
      <MapPin size={20} strokeWidth={1.75} aria-hidden />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, 100))}
        placeholder="Add location"
        aria-label="Location"
        className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg"
      />
      {value && (
        <button type="button" aria-label="Clear location" onClick={() => onChange('')} className="grid size-8 place-items-center rounded-full text-muted hover:text-fg">
          <X size={16} />
        </button>
      )}
    </div>
  )
}
