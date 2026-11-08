/**
 * The tabs under a profile (Posts, Reels, Tagged, plus Saved on mine) and the grid for the open tab.
 */
import { Bookmark, Camera, Clapperboard, Grid3x3, SquareUser } from 'lucide-react'
import type { ReactNode } from 'react'
import { useOpenCreate } from '../../app/navigation'
import { Button, EmptyState, PostGrid, Skeleton, Spinner, Tabs, type TabItem } from '../../components'
import { api } from '../../lib/api'
import { cx } from '../../lib/cx'
import { usePostList, type PostListState } from '../../lib/lists'
import { ReelGrid } from './ReelGrid'
import { useSavedPosts } from './savedPosts'

export type ProfileTab = 'posts' | 'reels' | 'tagged' | 'saved'

/** Which tab the URL points at: /name, /name/reels, /name/tagged, or /name?tab=saved (mine only). */
export function tabFromLocation(pathname: string, search: string, isMe: boolean): ProfileTab {
  if (pathname.endsWith('/reels')) return 'reels'
  if (pathname.endsWith('/tagged')) return 'tagged'
  if (isMe && new URLSearchParams(search).get('tab') === 'saved') return 'saved'
  return 'posts'
}

export function ProfileTabs({ username, tab, isMe }: { username: string; tab: ProfileTab; isMe: boolean }) {
  const items: TabItem[] = [
    { value: 'posts', label: 'Posts', icon: <Grid3x3 size={20} strokeWidth={1.75} />, href: `/${username}` },
    { value: 'reels', label: 'Reels', icon: <Clapperboard size={20} strokeWidth={1.75} />, href: `/${username}/reels` },
    { value: 'tagged', label: 'Tagged', icon: <SquareUser size={20} strokeWidth={1.75} />, href: `/${username}/tagged` },
  ]
  if (isMe) items.push({ value: 'saved', label: 'Saved', icon: <Bookmark size={20} strokeWidth={1.75} />, href: `/${username}?tab=saved` })
  return <Tabs items={items} value={tab} iconsOnMobile className="border-t" />
}

export function ProfileGrid({ username, tab, isMe }: { username: string; tab: ProfileTab; isMe: boolean }) {
  if (tab === 'saved') return <SavedGrid />
  return <TabGrid key={`${username}:${tab}`} username={username} tab={tab} isMe={isMe} />
}

function TabGrid({ username, tab, isMe }: { username: string; tab: Exclude<ProfileTab, 'saved'>; isMe: boolean }) {
  const list = usePostList(`profile:${username}:${tab}`, (cursor) => api.profilePosts(username, tab, cursor))
  return <GridBody list={list} reels={tab === 'reels'} empty={<TabEmpty tab={tab} isMe={isMe} username={username} />} />
}

function SavedGrid() {
  const list = useSavedPosts()
  return <GridBody list={list} empty={<SavedEmpty />} />
}

export function SavedEmpty() {
  return (
    <EmptyState
      icon={<Bookmark size={30} strokeWidth={1.5} />}
      title="Save what you love"
      body="Tap the bookmark on any post to keep it here. Only you can see what you've saved."
    />
  )
}

/** A post grid with its loading, error, empty and "loading more" states. */
export function GridBody({ list, reels = false, empty }: { list: PostListState; reels?: boolean; empty: ReactNode }) {
  if (list.loading) return <GridSkeleton tall={reels} />
  if (list.posts.length === 0) {
    if (list.error) {
      return (
        <div className="flex flex-col items-center gap-3 py-14 text-center text-sm text-muted">
          <p>{list.error}</p>
          <Button variant="secondary" onClick={() => list.refresh()}>
            Try again
          </Button>
        </div>
      )
    }
    return <>{empty}</>
  }
  return (
    <>
      {reels ? <ReelGrid posts={list.posts} /> : <PostGrid posts={list.posts} />}
      <div ref={list.sentinelRef} />
      {list.loadingMore && (
        <div className="flex justify-center py-6 text-muted">
          <Spinner size={24} />
        </div>
      )}
    </>
  )
}

export function GridSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-0.5 md:gap-1">
      {Array.from({ length: 9 }, (_, index) => (
        <Skeleton key={index} className={cx('rounded-none', tall ? 'aspect-[2/3]' : 'aspect-square')} />
      ))}
    </div>
  )
}

function TabEmpty({ tab, isMe, username }: { tab: Exclude<ProfileTab, 'saved'>; isMe: boolean; username: string }) {
  const openCreate = useOpenCreate()
  if (tab === 'posts') {
    return isMe ? (
      <EmptyState
        icon={<Camera size={30} strokeWidth={1.5} />}
        title="Share your first photo"
        body="When you share photos and videos, they'll show up here. Everyone's waiting to see them."
        action={<Button onClick={openCreate}>Share your first photo</Button>}
      />
    ) : (
      <EmptyState icon={<Camera size={30} strokeWidth={1.5} />} title="No posts yet" />
    )
  }
  if (tab === 'reels') {
    return isMe ? (
      <EmptyState
        icon={<Clapperboard size={30} strokeWidth={1.5} />}
        title="Share your first reel"
        body="Post a video and it plays here and in everyone's Reels."
        action={<Button onClick={openCreate}>Create a reel</Button>}
      />
    ) : (
      <EmptyState icon={<Clapperboard size={30} strokeWidth={1.5} />} title="No reels yet" />
    )
  }
  return isMe ? (
    <EmptyState icon={<SquareUser size={30} strokeWidth={1.5} />} title="Photos of you" body="When people tag you in photos, they'll appear here." />
  ) : (
    <EmptyState icon={<SquareUser size={30} strokeWidth={1.5} />} title="No photos" body={`When people tag ${username} in photos, they'll appear here.`} />
  )
}
