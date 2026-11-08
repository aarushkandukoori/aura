/**
 * My saved posts, shared by the Saved page and the Saved tab on my profile (same cached list).
 */
import { useEffect } from 'react'
import { api } from '../../lib/api'
import { usePostList, type PostListState } from '../../lib/lists'
import { useStore } from '../../lib/store'

export function useSavedPosts(): PostListState {
  const list = usePostList('saved', (cursor) => api.saved(cursor))
  const { refresh } = list

  // Posts get saved all over the app, so look again whenever this opens (the cached list shows meanwhile).
  useEffect(() => {
    if (useStore.getState().postLists.saved) refresh()
  }, [refresh])

  // Unsaving elsewhere takes a post out right away.
  return { ...list, posts: list.posts.filter((post) => post.savedByMe) }
}
