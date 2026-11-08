import SwiftUI

/// Everything under the action row: "Liked by …", the caption, "View all N comments", two preview
/// comments and how long ago it was posted.
struct PostFooter: View {
    @Environment(AppStore.self) private var store
    @Environment(\.postCellContext) private var context
    let post: Post

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            likesLine
            if !post.caption.isEmpty {
                CaptionText(username: post.author.username, caption: post.caption)
            }
            if !context.isDetailPage {
                commentsPreview
            }
            // Re-checked every minute so "Just now" turns into "1 minute ago" by itself.
            TimelineView(.everyMinute) { timeline in
                Text(Format.timeAgoLong(post.createdAt, now: timeline.date))
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }
            .padding(.top, 2)
        }
        .padding(.horizontal, 14)
        .padding(.top, 9)
    }

    // MARK: - Likes

    /// "Liked by maya.chen and 1,203 others" (or "12 likes"). Opens the list of likers.
    @ViewBuilder private var likesLine: some View {
        if post.likeCount > 0 {
            NavigationLink(value: Route.likes(post.id)) {
                HStack(spacing: 7) {
                    if let liker = post.likedBy {
                        AvatarView(account: liker, size: 20)
                    }
                    likesText
                        .font(.subheadline)
                        .foregroundStyle(Theme.text)
                        .multilineTextAlignment(.leading)
                        .contentTransition(.numericText(value: Double(post.likeCount)))
                        .animation(.snappy, value: post.likeCount)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    private var likesText: Text {
        guard let liker = post.likedBy else {
            return Text(Format.count(post.likeCount, "like")).bold()
        }
        let others = post.likeCount - 1
        if others <= 0 {
            return Text("Liked by \(Text(liker.username).bold())")
        }
        return Text("Liked by \(Text(liker.username).bold()) and \(Text(Format.count(others, "other")).bold())")
    }

    // MARK: - Comments

    @ViewBuilder private var commentsPreview: some View {
        if post.commentCount > 0 {
            Button { store.showComments(postId: post.id) } label: {
                Text(post.commentCount == 1 ? "View 1 comment" : "View all \(Format.count(post.commentCount)) comments")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        ForEach(post.previewComments.prefix(2)) { comment in
            Button { store.showComments(postId: post.id) } label: {
                Text(Format.caption(username: comment.author.username, text: comment.text))
                    .font(.subheadline)
                    .foregroundStyle(Theme.text)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .transition(.opacity.combined(with: .move(edge: .bottom)))
        }
    }
}

/// A caption ("username caption…") cut to two lines, with "more" to read the rest.
struct CaptionText: View {
    let username: String
    let caption: String

    @State private var expanded = false
    @State private var isLong = false

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            text
                .lineLimit(expanded ? nil : 2)
                .background {
                    // Measures the caption: if the full text doesn't fit in the two-line box,
                    // ViewThatFits falls back to the Color, which marks the caption as long.
                    if !expanded {
                        ViewThatFits(in: .vertical) {
                            text.fixedSize(horizontal: false, vertical: true).hidden()
                            Color.clear.onAppear { isLong = true }
                        }
                    }
                }
            if isLong && !expanded {
                Button {
                    withAnimation(.easeInOut(duration: 0.25)) { expanded = true }
                } label: {
                    Text("more")
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                        .padding(.trailing, 24)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var text: some View {
        Text(Format.caption(username: username, text: caption))
            .font(.subheadline)
            .foregroundStyle(Theme.text)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
