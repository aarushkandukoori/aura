import SwiftUI

/// Like, comment, share and save, each with its live count.
struct PostActionBar: View {
    @Environment(AppStore.self) private var store
    @Environment(\.postCellContext) private var context
    let post: Post

    var body: some View {
        HStack(spacing: 18) {
            Button { store.toggleLike(post.id) } label: {
                action(post.likedByMe ? "heart.fill" : "heart", count: post.likeCount,
                       tint: post.likedByMe ? Theme.like : Theme.text)
                    .symbolEffect(.bounce, value: post.likedByMe)
            }
            .accessibilityLabel(post.likedByMe ? "Unlike" : "Like")

            Button { openComments() } label: {
                action("bubble.right", count: post.commentCount)
            }
            .accessibilityLabel("Comments")

            Button { store.showShareSheet(for: post) } label: {
                action("paperplane", count: post.shareCount)
            }
            .accessibilityLabel("Share")

            Spacer()

            Button { store.toggleSave(post.id) } label: {
                Image(systemName: post.savedByMe ? "bookmark.fill" : "bookmark")
                    .font(.system(size: 21))
                    .symbolEffect(.bounce, value: post.savedByMe)
                    .frame(width: 32, height: 32)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(post.savedByMe ? "Remove from saved" : "Save")
        }
        .buttonStyle(.plain)
        .foregroundStyle(Theme.text)
        .padding(.horizontal, 14)
        .padding(.top, 11)
    }

    /// An icon with its number beside it (no number while it's zero).
    private func action(_ symbol: String, count: Int, tint: Color = Theme.text) -> some View {
        HStack(spacing: 5) {
            Image(systemName: symbol)
                .font(.system(size: 22))
                .foregroundStyle(tint)
            if count > 0 {
                CountText(value: count)
                    .font(.subheadline.weight(.semibold))
            }
        }
        .contentShape(Rectangle())
    }

    private func openComments() {
        if let onComment = context.onComment {
            onComment()
        } else {
            store.showComments(postId: post.id)
        }
    }
}
