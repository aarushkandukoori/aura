import SwiftUI

/// A single post with its comments under it and a comment box at the bottom.
/// Opened from "Go to post", profile grids, notifications and links (/p/<id>).
struct PostDetailView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let postId: String

    @State private var errorMessage: String?
    @State private var replyingTo: Comment?
    @FocusState private var composerFocused: Bool
    /// Set when a grid tile opened this post: the page zooms out of the tile (and back into it).
    @State private var zoomID: String?

    init(postId: String) {
        self.postId = postId
        _zoomID = State(initialValue: ZoomSources.zoomID(opening: postId))
    }

    var body: some View {
        Group {
            if let post = store.post(postId) {
                content(post)
            } else if let errorMessage {
                EmptyStateView(systemImage: "photo", title: "Post unavailable", message: errorMessage,
                               actionTitle: "Try again") { Task { await load() } }
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("Post")
        .navigationBarTitleDisplayMode(.inline)
        .zoomDestination(id: zoomID)
        .task { if store.post(postId) == nil { await load() } }
        .onAppear { Tracker.shared.open(postId) }
        // Deleted while open (from the ⋯ menu here, or anywhere else): leave the page.
        .onChange(of: store.post(postId) == nil) { wasMissing, isMissing in
            if !wasMissing && isMissing { dismiss() }
        }
    }

    private func content(_ post: Post) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    PostCellView(post: post)
                    Rectangle().fill(Theme.border).frame(height: 0.5)
                    CommentsList(postId: postId) { comment in replyingTo = comment }
                        .padding(.vertical, 6)
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await refresh() }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                CommentComposer(postId: postId, replyingTo: $replyingTo, isFocused: $composerFocused) { comment in
                    withAnimation { proxy.scrollTo(comment.id, anchor: .center) }
                }
            }
            .environment(\.postCellContext, PostCellContext(isDetailPage: true, onComment: { composerFocused = true }))
        }
    }

    private func load() async {
        do {
            try await store.loadPost(postId)
            errorMessage = nil
        } catch {
            if !error.isCancellation { errorMessage = error.localizedDescription }
        }
    }

    private func refresh() async {
        _ = try? await store.loadPost(postId)
        try? await store.loadComments(for: postId)
    }
}
