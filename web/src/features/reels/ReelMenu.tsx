import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useOpenPost } from '../../app/navigation'
import { ConfirmDialog, Menu, toast, type MenuItem } from '../../components'
import { api } from '../../lib/api'
import { copyLink } from '../../lib/clipboard'
import { useStore } from '../../lib/store'
import type { Post } from '../../lib/types'

/** The ⋯ menu on a reel: go to the post or the account, copy the link, and delete my own reels. */
export function ReelMenu({ post }: { post: Post }) {
  const navigate = useNavigate()
  const openPost = useOpenPost()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const mine = post.author.kind === 'me'

  async function deleteReel() {
    try {
      await api.deletePost(post.id)
      useStore.getState().removePost(post.id)
      toast('Reel deleted')
    } catch {
      toast("Couldn't delete this reel. Try again.")
    }
  }

  const items: MenuItem[] = [
    { label: 'Go to post', onSelect: () => openPost(post.id) },
    { label: mine ? 'Go to your profile' : 'About this account', onSelect: () => navigate(`/${post.author.username}`) },
    { label: 'Copy link', onSelect: () => copyLink(`/reels/${post.id}`) },
  ]
  if (mine) items.unshift({ label: 'Delete', danger: true, onSelect: () => setConfirmingDelete(true) })

  return (
    <>
      <Menu items={items} label="More options" className="size-11" />
      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={deleteReel}
        title="Delete reel?"
        message="It will be removed from your profile and from everyone's feed."
        confirmLabel="Delete"
        danger
      />
    </>
  )
}
