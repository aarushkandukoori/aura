import { useGoBack } from '../../app/navigation'
import { PageHeader } from '../../components'
import type { Post } from '../../lib/types'
import { CommentComposer, EmojiQuickBar } from './CommentComposer'
import { CommentThread } from './CommentThread'
import { PostCard } from './PostCard'
import { useCommentDraft } from './useCommentDraft'

/** The phone post page: the post, then every comment, with the comment box pinned above the tab bar. */
export function PostDetailMobile({ post }: { post: Post }) {
  const draft = useCommentDraft()
  const goBack = useGoBack('/')
  return (
    <div>
      <PageHeader title="Post" back />
      <PostCard post={post} variant="page" onComment={() => draft.inputRef.current?.focus()} onDeleted={goBack} />
      <CommentThread post={post} draft={draft} className="pb-2" />
      <div className="sticky bottom-[var(--tabbar-h)] z-20 border-t border-line bg-bg">
        <EmojiQuickBar onPick={draft.addEmoji} />
        <CommentComposer post={post} draft={draft} />
      </div>
    </div>
  )
}
