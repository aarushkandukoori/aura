import { Search } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { useInModal } from '../../app/navigation'
import { LoadingBlock, PageHeader, UserRow } from '../../components'
import { api } from '../../lib/api'
import { formatNumber } from '../../lib/format'
import { useLiveEvent } from '../../lib/live'
import { usePost } from '../../lib/store'
import type { LikesResponse } from '../../lib/types'

/**
 * /p/:id/likes - who liked a post: the people we know by name (with Follow buttons), then
 * "and 12,340 others" for the crowd. A modal on desktop, a page on phones. It refreshes itself
 * while new likes come in.
 */
export function LikesPage() {
  const { id = '' } = useParams()
  const inModal = useInModal()
  const post = usePost(id)
  const [likes, setLikes] = useState<LikesResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState('')
  const refreshTimer = useRef<number | undefined>(undefined)

  const load = useCallback(() => {
    api.postLikes(id).then(setLikes).catch(() => setFailed(true))
  }, [id])

  useEffect(load, [load])
  useEffect(() => () => window.clearTimeout(refreshTimer.current), [])

  // Likes arrive in waves; refresh the list at most every two seconds.
  useLiveEvent('post.stats', (event) => {
    if (event.postId !== id || refreshTimer.current !== undefined) return
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = undefined
      load()
    }, 2000)
  })

  const query = filter.trim().toLowerCase()
  const accounts = likes?.accounts ?? []
  const shown = query ? accounts.filter((a) => a.username.includes(query) || a.displayName.toLowerCase().includes(query)) : accounts
  // The live count can be ahead of the list we fetched.
  const total = Math.max(likes?.total ?? 0, post?.likeCount ?? 0)
  const others = total - accounts.length

  let list: ReactNode
  if (!likes) list = failed ? <p className="px-4 py-10 text-center text-sm text-muted">Couldn't load likes.</p> : <LoadingBlock />
  else if (accounts.length === 0) list = <p className="px-4 py-10 text-center text-sm text-muted">No likes yet.</p>
  else {
    list = (
      <>
        {shown.map((account) => (
          <UserRow key={account.id} account={account} follow />
        ))}
        {query && shown.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">No one found.</p>}
        {!query && others > 0 && (
          <p className="px-4 py-5 text-center text-sm text-muted">
            and {formatNumber(others)} {others === 1 ? 'other' : 'others'}
          </p>
        )}
      </>
    )
  }

  const body = (
    <>
      <div className="shrink-0 px-4 py-2">
        <label className="flex h-9 items-center gap-2 rounded-lg bg-surface px-3 text-muted">
          <Search size={16} />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search"
            aria-label="Search people who liked this"
            className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">{list}</div>
    </>
  )

  if (inModal) {
    return (
      <div className="flex h-[min(70dvh,560px)] w-[min(400px,calc(100vw-32px))] flex-col">
        <h1 className="flex h-12 shrink-0 items-center justify-center border-b border-line text-base font-semibold">Likes</h1>
        {body}
      </div>
    )
  }
  return (
    <div className="flex flex-col md:mx-auto md:my-8 md:h-[min(80dvh,640px)] md:max-w-[480px] md:overflow-hidden md:rounded-xl md:border md:border-line">
      <PageHeader title="Likes" back={`/p/${id}`} className="md:hidden" />
      <h1 className="hidden h-12 shrink-0 items-center justify-center border-b border-line text-base font-semibold md:flex">Likes</h1>
      {body}
    </div>
  )
}
