import Foundation

/// One row of a chat, top to bottom: a time label, a message, "Seen" under my last message,
/// the typing bubble, and a small spacer at the very end.
enum ChatItem: Identifiable {
    case time(Millis, id: String)
    case message(Message, ChatPlacement)
    case status(String)
    case typing([Account])
    case end

    /// The spacer at the very bottom (ChatView scrolls to it to show the newest messages).
    static let endId = "end"
    static let statusId = "status"
    static let typingId = "typing"
    /// The rows after the newest message. When one of them is at the bottom edge of the screen,
    /// you're looking at the newest messages.
    static let newestIds: Set<String> = [endId, statusId, typingId]

    var id: String {
        switch self {
        case .time(_, let id): id
        case .message(let message, _): message.id
        case .status: Self.statusId
        case .typing: Self.typingId
        case .end: Self.endId
        }
    }
}

/// Where a message sits among the messages around it. Bubbles from the same person in a row form
/// a "run": they sit close together, only the first shows the sender's name (in groups) and only
/// the last shows their avatar.
struct ChatPlacement: Equatable {
    var isMine: Bool
    var isFirstInRun: Bool
    var isLastInRun: Bool
    var showsName: Bool
    var showsAvatar: Bool
}

/// Turns a chat's messages into the rows ChatView draws.
@MainActor
enum ChatTimeline {
    /// A time label goes above a message sent this long after the one before it.
    static let separatorGap: Millis = 15 * 60 * 1000

    static func items(messages: [Message], conversation: Conversation?, typers: [Account]) -> [ChatItem] {
        let isGroup = conversation?.isGroup ?? false
        var items: [ChatItem] = []
        for (index, message) in messages.enumerated() {
            let previous = index > 0 ? messages[index - 1] : nil
            let next = index + 1 < messages.count ? messages[index + 1] : nil

            let startsAfterGap = previous.map { message.createdAt - $0.createdAt >= separatorGap } ?? true
            let nextStartsAfterGap = next.map { $0.createdAt - message.createdAt >= separatorGap } ?? true
            if startsAfterGap {
                items.append(.time(message.createdAt, id: "time-\(message.id)"))
            }

            let isFirst = startsAfterGap || previous?.sender.id != message.sender.id
            let isLast = nextStartsAfterGap || next?.sender.id != message.sender.id
            items.append(.message(message, ChatPlacement(
                isMine: message.isMine,
                isFirstInRun: isFirst,
                isLastInRun: isLast,
                showsName: isGroup && !message.isMine && isFirst,
                showsAvatar: !message.isMine && isLast
            )))
        }
        if let status = status(after: messages.last, in: conversation) {
            items.append(.status(status))
        }
        if !typers.isEmpty {
            items.append(.typing(typers))
        }
        items.append(.end)
        return items
    }

    /// "Seen 2m ago" (or "Sent") under my last message in a DM. Groups don't have read receipts.
    private static func status(after last: Message?, in conversation: Conversation?) -> String? {
        guard let last, last.isMine, let conversation, !conversation.isGroup,
              !last.id.hasPrefix(AppStore.localPrefix) else { return nil }
        if let seenAt = conversation.seenAt, seenAt >= last.createdAt {
            return MessagePreview.seenLine(seenAt)
        }
        return "Sent"
    }
}
