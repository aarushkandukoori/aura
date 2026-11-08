import SwiftUI

/// The comments of a post as a bottom sheet (opened with `store.showComments(postId:)`).
/// MainTabView presents it with the medium and large detents.
struct CommentsSheet: View {
    @Environment(AppStore.self) private var store
    let postId: String

    @State private var replyingTo: Comment?
    @FocusState private var composerFocused: Bool

    var body: some View {
        ScrollViewReader { proxy in
            VStack(spacing: 0) {
                Text("Comments")
                    .font(.headline)
                    .foregroundStyle(Theme.text)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 22)
                    .padding(.bottom, 12)
                Rectangle().fill(Theme.border).frame(height: 0.5)
                ScrollView {
                    CommentsList(postId: postId) { comment in replyingTo = comment }
                        .padding(.vertical, 6)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                CommentComposer(postId: postId, replyingTo: $replyingTo, isFocused: $composerFocused) { comment in
                    withAnimation { proxy.scrollTo(comment.id, anchor: .center) }
                }
            }
        }
        .background(Theme.background)
        .task {
            // Opened from a link or notification: fetch the post so we know whose post it is.
            if store.post(postId) == nil { _ = try? await store.loadPost(postId) }
        }
    }
}
