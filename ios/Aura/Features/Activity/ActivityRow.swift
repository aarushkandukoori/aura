import SwiftUI

/// One notification: who did what and when, with the post's picture or a Follow back button on the
/// right. Tapping it opens what it's about; tapping the picture opens their profile.
struct ActivityRow: View {
    @Environment(AppStore.self) private var store
    let notification: AuraNotification
    let isNew: Bool

    var body: some View {
        Button(action: open) {
            HStack(spacing: 12) {
                ActivityAvatar(notification: notification)
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(Theme.text)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                trailing
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 9)
            .background {
                if notification.kind == .milestone {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(Theme.auraGradient.opacity(0.16))
                        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .strokeBorder(Theme.ringGradient.opacity(0.5), lineWidth: 1))
                        .padding(.horizontal, 8)
                } else if isNew {
                    Theme.accent.opacity(0.05)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Text

    /// "maya and 1,203 others liked your post. 2h" with the names in bold and the time in gray.
    private var message: AttributedString {
        var text = AttributedString()
        if notification.kind == .milestone {
            text += bold(notification.text ?? "You reached a new milestone ✨")
        } else {
            text += bold(notification.actor?.username ?? "Someone")
            if notification.others > 0, notification.kind == .like || notification.kind == .follow {
                text += AttributedString(" and ") + bold(Format.count(notification.others, "other"))
            }
            text += AttributedString(" " + action)
        }
        var time = AttributedString(" " + Format.timeAgo(notification.createdAt))
        time.foregroundColor = Theme.muted
        return text + time
    }

    /// What happened, in words.
    private var action: String {
        let quote = notification.text.map { ": \($0)" } ?? "."
        switch notification.kind {
        case .like: return "liked your post."
        case .comment: return notification.text == nil ? "commented on your post." : "commented" + quote
        case .reply: return "replied to your comment" + quote
        case .mention: return "mentioned you in a comment" + quote
        case .commentLike: return "liked your comment" + quote
        case .follow: return "started following you."
        case .storyReaction: return "reacted to your story" + quote
        case .tag: return "tagged you in a post."
        case .milestone: return ""
        }
    }

    private func bold(_ string: String) -> AttributedString {
        var text = AttributedString(string)
        text.inlinePresentationIntent = .stronglyEmphasized
        return text
    }

    // MARK: - Right side

    @ViewBuilder private var trailing: some View {
        if notification.kind == .follow, let actor = notification.actor {
            FollowButton(account: actor)
        } else if let thumb = notification.postThumb {
            RemoteImage(path: thumb)
                .frame(width: 44, height: 44)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
    }

    // MARK: - Tapping

    private func open() {
        switch notification.kind {
        case .like, .tag:
            if let postId = notification.postId { store.navigate(to: .post(postId)) }
        case .comment, .reply, .mention, .commentLike:
            if let postId = notification.postId {
                store.navigate(to: .post(postId))
                store.showComments(postId: postId)
            }
        case .follow:
            if notification.others > 0, let me = store.me {
                store.navigate(to: .followers(me.username))
            } else if let actor = notification.actor {
                store.navigate(to: .profile(actor.username))
            }
        case .storyReaction:
            if let actor = notification.actor { store.navigate(to: .profile(actor.username)) }
        case .milestone:
            if let me = store.me { store.navigate(to: .profile(me.username)) }
        }
    }
}

/// The picture on the left: the person's avatar, two overlapping circles when more people did it,
/// or a glowing aura badge for milestones.
private struct ActivityAvatar: View {
    @Environment(AppStore.self) private var store
    let notification: AuraNotification

    private let size: CGFloat = 44

    var body: some View {
        if notification.kind == .milestone {
            Text("✦")
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .frame(width: size, height: size)
                .background(Theme.ringGradient, in: Circle())
                .shadow(color: Theme.aura2.opacity(0.4), radius: 8)
        } else if notification.others > 0, let actor = notification.actor {
            ZStack(alignment: .topLeading) {
                DefaultAvatar()
                    .frame(width: 32, height: 32)
                    .clipShape(Circle())
                AvatarView(account: actor, size: 32) { openProfile(actor) }
                    .padding(2)
                    .background(Circle().fill(Theme.background))
                    .offset(x: 10, y: 10)
            }
            .frame(width: size, height: size, alignment: .topLeading)
        } else if let actor = notification.actor {
            AvatarView(account: actor, size: size, showsStoryRing: true) { openProfile(actor) }
        } else {
            AvatarView(path: nil, size: size)
        }
    }

    private func openProfile(_ account: Account) {
        store.navigate(to: .profile(account.username))
    }
}
