import SwiftUI

/// One chat in the inbox: picture (with a green dot when they're active), name, the last message
/// or "typing...", how long ago, and a dot when there's something unread.
struct ConversationRow: View {
    let conversation: Conversation
    /// Passed in by the inbox's once-a-minute timeline so "5m" stays current.
    var now: Date = .now

    private var isUnread: Bool { conversation.unread > 0 }

    private var typers: [Account] {
        conversation.members.filter { conversation.typing.contains($0.id) }
    }

    /// A DM with a verified creator gets the badge after the name.
    private var isVerifiedDM: Bool {
        !conversation.isGroup && conversation.members.first?.verified == true
    }

    var body: some View {
        HStack(spacing: 12) {
            ConversationAvatar(conversation: conversation, size: 56)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Text(conversation.title)
                        .font(.subheadline.weight(isUnread ? .semibold : .regular))
                        .foregroundStyle(Theme.text)
                        .lineLimit(1)
                    if isVerifiedDM { VerifiedBadge(size: 12) }
                    if conversation.muted {
                        Image(systemName: "bell.slash.fill")
                            .font(.caption2)
                            .foregroundStyle(Theme.muted)
                            .accessibilityLabel("Muted")
                    }
                }
                secondLine
                    .font(.subheadline)
            }
            Spacer(minLength: 8)
            if isUnread {
                Circle()
                    .fill(Theme.accent)
                    .frame(width: 9, height: 9)
                    .accessibilityLabel("Unread")
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    /// "typing..." while someone types, otherwise the last message and its time.
    @ViewBuilder private var secondLine: some View {
        if !typers.isEmpty {
            Text(MessagePreview.typingLine(typers, isGroup: conversation.isGroup))
                .fontWeight(.medium)
                .foregroundStyle(Theme.accent)
                .lineLimit(1)
        } else {
            HStack(spacing: 4) {
                Text(MessagePreview.inboxLine(for: conversation))
                    .fontWeight(isUnread ? .semibold : .regular)
                    .foregroundStyle(isUnread ? Theme.text : Theme.muted)
                    .lineLimit(1)
                if conversation.lastMessage != nil {
                    Text("· \(Format.timeAgo(conversation.lastMessageAt, now: now))")
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                        .layoutPriority(1) // the time never gets cut off; the preview does
                }
            }
        }
    }
}

/// A person to start a chat with: avatar, name and username.
struct ChatPersonRow: View {
    let account: Account

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(account: account, size: 52)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(account.displayName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.text)
                        .lineLimit(1)
                    if account.verified { VerifiedBadge(size: 12) }
                }
                Text(account.username)
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
        .contentShape(Rectangle())
    }
}
