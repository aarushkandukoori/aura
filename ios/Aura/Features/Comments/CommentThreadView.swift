import SwiftUI

/// A top-level comment with its replies tucked under "View replies (N)".
struct CommentThreadView: View {
    let comment: Comment
    let post: Post?
    /// The comment ids that were already there when the list opened (nil while loading).
    let knownIds: Set<String>?
    var onReply: (Comment) -> Void

    @State private var showsReplies = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            CommentRow(comment: comment, post: post, isFresh: isFresh(comment), onReply: onReply)
                .id(comment.id)

            if showsReplies {
                ForEach(comment.replies) { reply in
                    CommentRow(comment: reply, post: post, isReply: true, isFresh: isFresh(reply), onReply: onReply)
                        .padding(.leading, 48)
                        .id(reply.id)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }

            if !comment.replies.isEmpty {
                Button {
                    withAnimation(.snappy) { showsReplies.toggle() }
                } label: {
                    HStack(spacing: 10) {
                        Rectangle()
                            .fill(Theme.muted.opacity(0.5))
                            .frame(width: 24, height: 1)
                        Text(showsReplies ? "Hide replies" : "View replies (\(comment.replies.count))")
                            .contentTransition(.numericText(value: Double(comment.replies.count)))
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.muted)
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.leading, 64)
                .padding(.bottom, 4)
            }
        }
        // When I reply, open the thread so I can see my reply land.
        .onChange(of: comment.replies.count) { oldCount, newCount in
            if newCount > oldCount, comment.replies.last?.author.isMe == true {
                withAnimation(.snappy) { showsReplies = true }
            }
        }
    }

    private func isFresh(_ comment: Comment) -> Bool {
        guard let knownIds else { return false }
        return !knownIds.contains(comment.id)
    }
}
