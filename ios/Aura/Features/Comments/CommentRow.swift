import SwiftUI
import UIKit

/// One comment or reply: avatar, name, time, text, "Reply", the author's heart, and a like button
/// with its count. Long-press for Reply / Copy / Pin / Delete.
struct CommentRow: View {
    @Environment(AppStore.self) private var store
    let comment: Comment
    /// The post it belongs to (who wrote it decides "Author", the author's heart, pin and delete).
    let post: Post?
    var isReply = false
    /// Arrived after the list was opened: it glows for a moment so new comments catch the eye.
    var isFresh = false
    var onReply: (Comment) -> Void

    @State private var glowing = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            AvatarView(account: comment.author, size: isReply ? 28 : 36, showsStoryRing: true) {
                store.navigate(to: .profile(comment.author.username))
            }

            VStack(alignment: .leading, spacing: 3) {
                if comment.pinned {
                    Label("Pinned", systemImage: "pin.fill")
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                }
                nameLine
                Text(Format.richText(comment.text))
                    .font(.subheadline)
                    .foregroundStyle(Theme.text)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 16) {
                    Button { onReply(comment) } label: {
                        Text("Reply")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Theme.muted)
                            .padding(.vertical, 4)
                            .padding(.trailing, 8)
                            .contentShape(Rectangle())
                    }
                    if comment.likedByAuthor, let author = post?.author {
                        likedByAuthorBadge(author)
                    }
                }
                .buttonStyle(.plain)
                .padding(.top, 3)
            }

            Spacer(minLength: 4)
            likeButton
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 9)
        .background(Theme.accent.opacity(glowing ? 0.1 : 0))
        .contentShape(Rectangle())
        .contextMenu { menuItems }
        .onAppear {
            guard isFresh else { return }
            glowing = true
            withAnimation(.easeOut(duration: 1.6).delay(0.4)) { glowing = false }
        }
    }

    private var nameLine: some View {
        HStack(spacing: 4) {
            Button { store.navigate(to: .profile(comment.author.username)) } label: {
                Text(comment.author.username)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if comment.author.verified { VerifiedBadge(size: 11) }
            if comment.author.id == post?.author.id {
                Text("· Author")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(Theme.muted)
            }
            Text(Format.timeAgo(comment.createdAt))
                .font(.caption)
                .foregroundStyle(Theme.muted)
                .padding(.leading, 2)
        }
    }

    private var likeButton: some View {
        Button { store.toggleCommentLike(comment) } label: {
            VStack(spacing: 2) {
                Image(systemName: comment.likedByMe ? "heart.fill" : "heart")
                    .font(.system(size: 14))
                    .foregroundStyle(comment.likedByMe ? Theme.like : Theme.muted)
                    .symbolEffect(.bounce, value: comment.likedByMe)
                if comment.likeCount > 0 {
                    CountText(value: comment.likeCount)
                        .font(.caption2)
                        .foregroundStyle(Theme.muted)
                }
            }
            .frame(width: 32)
            .padding(.top, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(comment.likedByMe ? "Unlike comment" : "Like comment")
    }

    /// The post author's tiny avatar with a heart: "the author liked this".
    private func likedByAuthorBadge(_ author: Account) -> some View {
        AvatarView(account: author, size: 18)
            .overlay(alignment: .bottomTrailing) {
                Image(systemName: "heart.fill")
                    .font(.system(size: 8))
                    .foregroundStyle(Theme.like)
                    .offset(x: 3, y: 2)
            }
            .accessibilityLabel("Liked by \(author.username)")
    }

    // MARK: - Long-press menu

    private var isOnMyPost: Bool { post?.author.isMe == true }

    @ViewBuilder private var menuItems: some View {
        Button { onReply(comment) } label: { Label("Reply", systemImage: "arrowshape.turn.up.left") }
        Button { UIPasteboard.general.string = comment.text } label: { Label("Copy", systemImage: "doc.on.doc") }
        // Only top-level comments can be pinned, and only on my own posts.
        if isOnMyPost && comment.parentId == nil {
            Button { pin() } label: {
                Label(comment.pinned ? "Unpin" : "Pin", systemImage: comment.pinned ? "pin.slash" : "pin")
            }
        }
        if comment.author.isMe || isOnMyPost {
            Button(role: .destructive) { delete() } label: { Label("Delete", systemImage: "trash") }
        }
    }

    private func pin() {
        Task {
            do {
                try await store.togglePin(comment)
                Haptics.success()
            } catch {
                if !error.isCancellation { Haptics.error() }
            }
        }
    }

    private func delete() {
        Task {
            do {
                try await store.deleteComment(comment)
                Haptics.tap()
            } catch {
                if !error.isCancellation { Haptics.error() }
            }
        }
    }
}
