import Foundation

/// The short texts the Messages screens show about a message or a chat: inbox previews
/// ("Maya: who's up", "You sent a photo"), reply chips, "typing..." and "Seen".
enum MessagePreview {
    /// What a message is about in a few words (its text, or "Photo" / "Shared a post"...).
    static func summary(of message: Message) -> String {
        if !message.text.isEmpty { return message.text }
        if let media = message.media { return media.isVideo ? "Video" : "Photo" }
        if message.sharedPost != nil { return "Shared a post" }
        if message.story != nil { return "Replied to a story" }
        return "Message"
    }

    /// The line under a chat's name in the inbox.
    static func inboxLine(for conversation: Conversation) -> String {
        guard let message = conversation.lastMessage else {
            return conversation.isGroup ? "New group · say hi 👋" : "Say hi 👋"
        }
        if message.story != nil {
            return message.isMine ? "You replied to their story" : "Replied to your story"
        }
        let action = actionWithoutText(message)
        if message.isMine {
            if let action { return "You \(action)" }
            return "You: \(message.text)"
        }
        let name = firstName(message.sender)
        if conversation.isGroup {
            if let action { return "\(name) \(action)" }
            return "\(name): \(message.text)"
        }
        if let action { return action.prefix(1).uppercased() + action.dropFirst() }
        return message.text
    }

    /// "typing..." for a DM, "Maya is typing..." or "Maya and Diego are typing..." for a group.
    static func typingLine(_ typers: [Account], isGroup: Bool) -> String {
        guard isGroup, let first = typers.first else { return "typing..." }
        switch typers.count {
        case 1: return "\(firstName(first)) is typing..."
        case 2: return "\(firstName(first)) and \(firstName(typers[1])) are typing..."
        default: return "\(firstName(first)) and \(typers.count - 1) others are typing..."
        }
    }

    /// "Seen just now" / "Seen 5m ago", from the conversation's seenAt.
    static func seenLine(_ seenAt: Millis) -> String {
        let ago = Format.timeAgo(seenAt)
        return ago == "now" ? "Seen just now" : "Seen \(ago) ago"
    }

    /// "Maya" from "Maya Okonkwo" (falls back to the username).
    static func firstName(_ account: Account) -> String {
        let first = account.displayName.split(separator: " ").first.map(String.init) ?? ""
        return first.isEmpty ? account.username : first
    }

    /// For messages without text: "sent a photo", "shared a post"... nil when the message has text.
    private static func actionWithoutText(_ message: Message) -> String? {
        guard message.text.isEmpty else { return nil }
        if let media = message.media { return media.isVideo ? "sent a video" : "sent a photo" }
        if message.sharedPost != nil { return "shared a post" }
        return "sent a message"
    }
}
