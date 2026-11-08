import SwiftUI

/// The chat's title in the navigation bar: picture, name, and a live second line
/// ("Active now", "Active 12m ago", "5 members", or "typing...").
struct ChatTitle: View {
    @Environment(AppStore.self) private var store
    let conversation: Conversation

    var body: some View {
        HStack(spacing: 10) {
            ConversationAvatar(conversation: conversation, size: 34)
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 3) {
                    Text(conversation.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.text)
                        .lineLimit(1)
                    if !conversation.isGroup, conversation.members.first?.verified == true {
                        VerifiedBadge(size: 11)
                    }
                }
                // Re-checked every minute so "Active 3m ago" keeps counting.
                TimelineView(.everyMinute) { context in
                    let typers = store.typingMembers(in: conversation.id)
                    Text(typers.isEmpty ? status(now: context.date) : MessagePreview.typingLine(typers, isGroup: conversation.isGroup))
                        .font(.caption)
                        .foregroundStyle(typers.isEmpty ? Theme.muted : Theme.accent)
                        .lineLimit(1)
                        .contentTransition(.opacity)
                        .animation(.easeInOut(duration: 0.2), value: typers.isEmpty)
                }
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityHint("Shows chat details")
    }

    private func status(now: Date) -> String {
        if conversation.isGroup {
            return "\(conversation.members.count + 1) members"
        }
        guard let member = conversation.members.first else { return "" }
        let current = store.latest(member)
        return Format.activeStatus(current.lastActiveAt, now: now) ?? current.username
    }
}

/// The top of a chat's history: a big picture, the name, and who they are to you.
/// Shown once you've scrolled all the way up (or right away in a new chat).
struct ChatIntro: View {
    @Environment(AppStore.self) private var store
    let conversation: Conversation

    var body: some View {
        VStack(spacing: 6) {
            ConversationAvatar(conversation: conversation, size: 92)
                .padding(.bottom, 6)
            Text(conversation.title)
                .font(.title3.weight(.bold))
                .foregroundStyle(Theme.text)
                .multilineTextAlignment(.center)
            Text(detail)
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
            if !conversation.isGroup, let member = conversation.members.first {
                Button("View profile") {
                    store.navigate(to: .profile(member.username))
                }
                .buttonStyle(.aura(.secondary, size: .small))
                .padding(.top, 8)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 24)
        .padding(.bottom, 20)
    }

    private var detail: String {
        if conversation.isGroup {
            let names = conversation.members.map { MessagePreview.firstName($0) }
            return (["You"] + names).joined(separator: ", ")
        }
        guard let member = conversation.members.first.map({ store.latest($0) }) else { return "" }
        let relation: String
        switch (member.iFollow, member.followsMe) {
        case (true, true): relation = "You follow each other"
        case (false, true): relation = "Follows you"
        case (true, false): relation = "You follow them"
        case (false, false): relation = "On Aura"
        }
        return "\(member.username) · \(relation)"
    }
}
