/**
 * /:username/followers and /:username/following: switch between the two, filter by name, follow
 * people right from the list, and keep scrolling for more.
 */
import { Search, X } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router'
import { Button, EmptyState, NotFound, PageHeader, Skeleton, Spinner, Tabs, UserRow } from '../../components'
import { formatCount } from '../../lib/format'
import { useDebouncedValue, useInfiniteScroll } from '../../lib/hooks'
import type { Profile } from '../../lib/types'
import { useFollowList, type FollowMode } from './useFollowList'
import { useFollowerCount, useProfile } from './useProfile'

export function FollowListPage({ mode }: { mode: FollowMode }) {
  const { username = '' } = useParams()
  const { profile, error: profileError } = useProfile(username)
  const [query, setQuery] = useState('')
  const search = useDebouncedValue(query.trim(), 250)
  const list = useFollowList(username.toLowerCase(), mode, search)
  const sentinel = useInfiniteScroll(list.loadMore, !list.done && !list.loadingMore && !list.error)

  if (profileError === 404) return <NotFound />
  const name = profile?.username ?? username

  return (
    <div className="mx-auto w-full max-w-[600px] pb-12 md:pt-8">
      <PageHeader title={name} back={`/${name}`} className="md:hidden" />
      <div className="md:overflow-hidden md:rounded-2xl md:border md:border-line">
        <h1 className="hidden px-5 pb-1 pt-4 text-center text-base font-semibold md:block">{name}</h1>
        {profile ? <CountTabs profile={profile} mode={mode} /> : <Tabs items={tabItems(name, null, null)} value={mode} />}

        <div className="px-4 py-3">
          <label className="flex h-10 items-center gap-2 rounded-xl bg-surface px-3 text-muted focus-within:ring-2 focus-within:ring-accent/25">
            <Search size={17} aria-hidden />
            <input
              type="text"
              inputMode="search"
              enterKeyHint="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              aria-label={`Search ${mode}`}
              className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted"
            />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="grid size-6 place-items-center rounded-full hover:text-fg">
                <X size={15} />
              </button>
            )}
          </label>
        </div>

        {list.loading ? (
          <ListSkeleton />
        ) : list.accounts.length === 0 && !list.error ? (
          search ? (
            <p className="px-4 py-10 text-center text-sm text-muted">No one matches "{search}".</p>
          ) : (
            <EmptyState title={mode === 'followers' ? 'No followers yet' : 'Not following anyone yet'} />
          )
        ) : (
          <div className="pb-2">
            {list.accounts.map((account) => (
              <UserRow key={account.id} account={account} follow />
            ))}
          </div>
        )}

        <div ref={sentinel} />
        {list.loadingMore && !list.loading && (
          <div className="flex justify-center py-4 text-muted">
            <Spinner size={22} />
          </div>
        )}
        {list.error && (
          <div className="flex flex-col items-center gap-3 py-8 text-center text-sm text-muted">
            <p>{list.error}</p>
            <Button variant="secondary" size="sm" onClick={list.retry}>
              Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function tabItems(username: string, followers: number | null, following: number | null) {
  return [
    { value: 'followers', label: followers === null ? 'Followers' : `${formatCount(followers)} followers`, href: `/${username}/followers` },
    { value: 'following', label: following === null ? 'Following' : `${formatCount(following)} following`, href: `/${username}/following` },
  ]
}

/** The two tabs with live counts (my follower count moves as people follow me). */
function CountTabs({ profile, mode }: { profile: Profile; mode: FollowMode }) {
  const followers = useFollowerCount(profile)
  return <Tabs items={tabItems(profile.username, followers, profile.following)} value={mode} />
}

function ListSkeleton() {
  return (
    <div className="pb-2">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-2">
          <Skeleton circle className="size-11 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}
