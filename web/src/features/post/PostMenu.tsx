import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ConfirmDialog, Menu, toast, type MenuItem } from '../../components'
import { api } from '../../lib/api'
import { copyLink } from '../../lib/clipboard'
import { useAccount, useStore } from '../../lib/store'
import type { Post } from '../../lib/types'

interface PostMenuProps {
  post: Post
  onShare: () => void
  /** In the post detail view "Go to post" would lead nowhere, so it is left out. */
  detail?: boolean
  /** Called after my post was deleted (the detail view closes itself). */
  onDeleted?: () => void
}

/** The ⋯ menu on a post: go to post, share, copy link, view profile, unfollow, or delete for my own posts. */
export function PostMenu({ post, onShare, detail = false, onDeleted }: PostMenuProps) {
  const navigate = useNavigate()
  const author = useAccount(post.author)
  const unfollow = useStore((s) => s.unfollow)
  const removePost = useStore((s) => s.removePost)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const isMine = author.kind === 'me'

  const items: MenuItem[] = []
  if (!detail) items.push({ label: 'Go to post', onSelect: () => navigate(`/p/${post.id}`) })
  items.push({ label: 'Share to…', onSelect: onShare })
  items.push({ label: 'Copy link', onSelect: () => copyLink(`/p/${post.id}`) })
  if (!isMine) items.push({ label: 'About this account', onSelect: () => navigate(`/${author.username}`) })
  if (!isMine && author.iFollow) {
    items.push({
      label: 'Unfollow',
      danger: true,
      onSelect: () => {
        unfollow(author)
        toast(`Unfollowed ${author.username}`)
      },
    })
  }
  if (isMine) items.push({ label: 'Delete', danger: true, onSelect: () => setConfirmingDelete(true) })

  async function deletePost() {
    try {
      await api.deletePost(post.id)
      removePost(post.id)
      toast('Post deleted')
      onDeleted?.()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't delete the post")
    }
  }

  return (
    <>
      <Menu items={items} label="Post options" className="-mr-2" />
      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={deletePost}
        title="Delete post?"
        message="Are you sure you want to delete this post? This can't be undone."
        confirmLabel="Delete"
        danger
      />
    </>
  )
}
