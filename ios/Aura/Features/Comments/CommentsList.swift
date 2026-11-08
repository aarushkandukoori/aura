import SwiftUI

/// The comment threads of a post, loaded into the store (so live comments land here by themselves).
/// It's only the rows: put it inside a ScrollView (CommentsSheet and PostDetailView do).
struct CommentsList: View {
    @Environment(AppStore.self) private var store
    let postId: String
    var onReply: (Comment) -> Void

    @State private var errorMessage: String?
    /// Comment ids already there when the list opened. Anything not in here arrived live and glows.
    @State private var knownIds: Set<String>?

    var body: some View {
        let comments = store.comments[postId]
        LazyVStack(alignment: .leading, spacing: 0) {
            if let comments {
                if comments.isEmpty {
                    EmptyStateView(systemImage: "bubble.left.and.bubble.right", title: "No comments yet",
                                   message: "Start the conversation.")
                }
                ForEach(comments) { comment in
                    CommentThreadView(comment: comment, post: store.post(postId), knownIds: knownIds, onReply: onReply)
                        .transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity),
                                                removal: .opacity))
                }
            } else if let errorMessage {
                EmptyStateView(systemImage: "wifi.slash", title: "Couldn't load comments", message: errorMessage,
                               actionTitle: "Try again") { Task { await load() } }
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 48)
            }
        }
        .animation(.spring(duration: 0.35), value: comments.map(Self.shape))
        .onAppear {
            if knownIds == nil, let comments { knownIds = Self.allIds(comments) }
        }
        .task(id: postId) { await load() }
    }

    private func load() async {
        do {
            try await store.loadComments(for: postId)
            errorMessage = nil
            if knownIds == nil { knownIds = Self.allIds(store.comments[postId] ?? []) }
        } catch {
            if !error.isCancellation { errorMessage = error.localizedDescription }
        }
    }

    /// Every comment and reply id.
    private static func allIds(_ comments: [Comment]) -> Set<String> {
        Set(comments.flatMap { [$0.id] + $0.replies.map(\.id) })
    }

    /// What the list looks like, for animating changes: each thread and how many replies it has.
    private static func shape(_ comments: [Comment]) -> [String] {
        comments.map { "\($0.id):\($0.replies.count)" }
    }
}
