import SwiftUI
import UIKit

/// One message in a chat: their avatar (on the last bubble of a run) and name (groups), the
/// message's pieces, its reactions, and "Not sent" with a retry when sending failed.
/// Double-tap a bubble to heart it; long press for the reaction bar, Reply and Copy.
struct MessageRow: View {
    @Environment(AppStore.self) private var store
    let message: Message
    let placement: ChatPlacement
    let conversation: Conversation?
    /// Briefly true after jumping here from a reply quote, so the eye finds it.
    var isHighlighted = false
    let onReply: () -> Void
    let onOpenPhoto: (Media) -> Void
    let onJumpTo: (String) -> Void

    static let reactionChoices = ["❤️", "😂", "😮", "😢", "😡", "👍"]

    private var isMine: Bool { placement.isMine }
    /// Still on its way to the server (a local copy).
    private var isLocal: Bool { message.id.hasPrefix(AppStore.localPrefix) }
    private var isFailed: Bool { store.failedMessageIds.contains(message.id) }
    private var myReaction: String? {
        let myId = store.me?.id ?? "me"
        return message.reactions.first { $0.accountId == myId }?.emoji
    }

    var body: some View {
        VStack(alignment: isMine ? .trailing : .leading, spacing: 3) {
            if placement.showsName {
                Text(MessagePreview.firstName(message.sender))
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                    .padding(.leading, 48) // lines up with the bubble, past the avatar column
            }
            HStack(alignment: .bottom, spacing: 8) {
                if isMine {
                    Spacer(minLength: 56)
                } else {
                    avatar
                }
                pieces
                    .scaleEffect(isHighlighted ? 1.05 : 1, anchor: isMine ? .trailing : .leading)
                    .animation(.spring(duration: 0.35, bounce: 0.45), value: isHighlighted)
                if !isMine { Spacer(minLength: 56) }
            }
            if isFailed { failedLine }
        }
        .padding(.top, placement.isFirstInRun ? 10 : 2)
        .padding(.bottom, message.reactions.isEmpty ? 0 : 20) // room for the reaction pill
        .opacity(isLocal && !isFailed ? 0.7 : 1)
    }

    // MARK: - Parts

    /// Their avatar sits next to the last bubble of a run; the other bubbles keep the space empty.
    @ViewBuilder private var avatar: some View {
        if placement.showsAvatar {
            AvatarView(account: message.sender, size: 28) {
                store.navigate(to: .profile(message.sender.username))
            }
        } else {
            Color.clear.frame(width: 28, height: 1)
        }
    }

    private var pieces: some View {
        VStack(alignment: isMine ? .trailing : .leading, spacing: 4) {
            if let story = message.story {
                MessageStoryReply(story: story, isMine: isMine, isReaction: ChatEmoji.isBigEmoji(message.text))
                    .onTapGesture { openStory() }
            }
            if let reply = message.replyTo {
                MessageReplyQuote(label: replyLabel(reply), quotedText: reply.text, isMine: isMine)
                    .onTapGesture { onJumpTo(reply.id) }
            }
            if let post = message.sharedPost {
                MessagePostCard(post: post)
                    .onTapGesture(count: 2) { toggleHeart() }
                    .onTapGesture { open(post) }
                    .contextMenu { menuItems }
            }
            if let media = message.media {
                MessagePhotoBubble(media: media)
                    .onTapGesture(count: 2) { toggleHeart() }
                    .onTapGesture { onOpenPhoto(media) }
                    .contextMenu { menuItems }
            }
            if !message.text.isEmpty {
                textPiece
                    .onTapGesture(count: 2) { toggleHeart() }
                    .contextMenu { menuItems }
            }
            if message.text.isEmpty && message.media == nil && message.sharedPost == nil {
                // A shared post that was deleted since: say so instead of an empty bubble.
                Text("This message isn't available anymore")
                    .font(.subheadline.italic())
                    .foregroundStyle(Theme.muted)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .overlay(MessageBubbleShape(placement: placement).stroke(Theme.border, lineWidth: 1))
            }
        }
        .overlay(alignment: isMine ? .bottomTrailing : .bottomLeading) {
            if !message.reactions.isEmpty {
                MessageReactionsBadge(reactions: message.reactions)
                    .offset(x: isMine ? -10 : 10, y: 17)
                    .transition(.scale(scale: 0.4).combined(with: .opacity))
            }
        }
        .animation(.spring(duration: 0.3, bounce: 0.5), value: message.reactions)
    }

    @ViewBuilder private var textPiece: some View {
        if ChatEmoji.isBigEmoji(message.text) && message.media == nil && message.sharedPost == nil {
            Text(message.text)
                .font(.system(size: 46))
                .padding(.vertical, 2)
        } else {
            MessageTextBubble(text: message.text, placement: placement)
        }
    }

    private var failedLine: some View {
        Button {
            Task { await store.retryMessage(message) }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "exclamationmark.circle.fill")
                Text("Not sent. Tap to try again.")
            }
            .font(.caption.weight(.medium))
            .foregroundStyle(Theme.like)
        }
        .buttonStyle(.plain)
        .padding(.top, 2)
    }

    // MARK: - Long-press menu

    @ViewBuilder private var menuItems: some View {
        if !isLocal {
            ControlGroup {
                ForEach(Self.reactionChoices, id: \.self) { emoji in
                    Button {
                        react(emoji == myReaction ? nil : emoji)
                    } label: {
                        Text(emoji)
                    }
                }
            }
            .controlGroupStyle(.palette)
            .menuActionDismissBehavior(.enabled) // palette buttons keep the menu open otherwise
            Button(action: onReply) {
                Label("Reply", systemImage: "arrowshape.turn.up.left")
            }
        }
        if !message.text.isEmpty {
            Button {
                UIPasteboard.general.string = message.text
                store.showToast("Copied")
            } label: {
                Label("Copy", systemImage: "doc.on.doc")
            }
        }
        if myReaction != nil {
            Button {
                react(nil)
            } label: {
                Label("Remove reaction", systemImage: "heart.slash")
            }
        }
        if isFailed {
            Button {
                Task { await store.retryMessage(message) }
            } label: {
                Label("Try again", systemImage: "arrow.clockwise")
            }
            Button(role: .destructive) {
                store.discardFailedMessage(message)
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    // MARK: - Actions

    private func react(_ emoji: String?) {
        Task { await store.react(to: message, emoji: emoji) }
    }

    /// Double-tap: heart it, or take the heart back.
    private func toggleHeart() {
        guard !isLocal else { return }
        react(myReaction == "❤️" ? nil : "❤️")
    }

    private func open(_ post: Post) {
        store.remember(post)
        store.navigate(to: post.isReel ? .reel(post.id) : .post(post.id))
    }

    /// My replies point at the other person's story; their replies point at mine.
    private func openStory() {
        guard let owner = isMine ? conversation?.members.first : store.me?.account else { return }
        Task {
            if !(await store.openStories(for: owner)) {
                store.showToast("This story isn't available anymore")
            }
        }
    }

    /// "You replied to Maya", "Maya replied to you", "Diego replied to Priya".
    private func replyLabel(_ reply: ReplyRef) -> String {
        let quotesMe = reply.senderName == "You" || reply.senderName == store.me?.displayName
        let quotedName = reply.senderName.split(separator: " ").first.map(String.init) ?? reply.senderName
        if isMine {
            return quotesMe ? "You replied to yourself" : "You replied to \(quotedName)"
        }
        let sender = MessagePreview.firstName(message.sender)
        if quotesMe { return "\(sender) replied to you" }
        return reply.senderName == message.sender.displayName ? "\(sender) replied" : "\(sender) replied to \(quotedName)"
    }
}

extension AppStore {
    /// Removes one of my messages that failed to send (Delete in its long-press menu).
    func discardFailedMessage(_ message: Message) {
        messages[message.conversationId]?.removeAll { $0.id == message.id }
        failedMessageIds.remove(message.id)
    }
}
