import SwiftUI

/// Like, comment, share and save, each with its live count, and the carousel dots in between.
/// The heart and the bookmark squash under the finger and pop when they turn on, like Instagram's.
struct PostActionBar: View {
    @Environment(AppStore.self) private var store
    @Environment(\.postCellContext) private var context
    let post: Post
    /// The carousel photo on screen, for the dots.
    var page = 0
    /// Called right after I save the post here (the cell slides up its "Saved" bar).
    var onSaved: () -> Void = {}

    var body: some View {
        HStack(spacing: 18) {
            Button { store.toggleLike(post.id) } label: {
                action(count: post.likeCount) {
                    PoppingIcon(symbol: "heart", isOn: post.likedByMe, onColor: Theme.like)
                }
            }
            .buttonStyle(.squash)
            .accessibilityLabel(post.likedByMe ? "Unlike" : "Like")

            Button { openComments() } label: {
                action(count: post.commentCount) { icon("bubble.right") }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Comments")

            Button { store.showShareSheet(for: post) } label: {
                action(count: post.shareCount) { icon("paperplane") }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Share")

            // The dots sit in the space between share and save (the counts make the left side wide).
            Spacer(minLength: 0)
            if post.media.count > 1 && !post.isReel {
                CarouselDots(count: post.media.count, current: page)
                Spacer(minLength: 0)
            }

            Button { toggleSave() } label: {
                PoppingIcon(symbol: "bookmark", isOn: post.savedByMe, size: 21)
                    .frame(width: 32, height: 32)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.squash)
            .accessibilityLabel(post.savedByMe ? "Remove from saved" : "Save")
        }
        .foregroundStyle(Theme.text)
        .padding(.horizontal, 14)
        .padding(.top, 11)
    }

    private func icon(_ symbol: String) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 22))
    }

    /// An icon with its number beside it (no number while it's zero). The number rolls as it changes.
    private func action(count: Int, @ViewBuilder icon: () -> some View) -> some View {
        HStack(spacing: 5) {
            icon()
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

    private func toggleSave() {
        let saving = !post.savedByMe
        store.toggleSave(post.id)
        if saving { onSaved() }
    }
}
