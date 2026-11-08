/**
 * /saved: every post I bookmarked (only I can see these). Same list as the Saved tab on my profile.
 */
import { Lock } from 'lucide-react'
import { PageHeader } from '../../components'
import { useMe } from '../../lib/store'
import { GridBody, SavedEmpty } from './ProfilePosts'
import { useSavedPosts } from './savedPosts'

export function SavedPage() {
  const me = useMe()
  const list = useSavedPosts()
  return (
    <div className="mx-auto w-full max-w-[935px] pb-12 md:px-5 md:pt-9">
      <PageHeader title="Saved" back={`/${me.username}`} className="md:hidden" />
      <div className="hidden items-end justify-between px-1 pb-5 md:flex">
        <h1 className="text-2xl font-bold">Saved</h1>
      </div>
      <p className="flex items-center gap-1.5 px-4 py-3 text-[13px] text-muted md:px-1 md:pt-0">
        <Lock size={13} />
        Only you can see what you've saved
      </p>
      <GridBody list={list} empty={<SavedEmpty />} />
    </div>
  )
}
