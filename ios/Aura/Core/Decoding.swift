import Foundation

// Forgiving JSON decoding for the models in Models.swift.
//
// The server is built at the same time as this app, so fields can go missing, arrive as null, or
// come back as 12.0 instead of 12. Instead of failing a whole feed page, each field falls back to a
// default, numbers are accepted in either form, and a broken item in a list is skipped.

extension KeyedDecodingContainer {
    /// Any optional value: nil when the key is missing, null, or the wrong type.
    func value<T: Decodable>(_ key: Key) -> T? {
        try? decodeIfPresent(T.self, forKey: key)
    }

    func string(_ key: Key, default fallback: String = "") -> String {
        value(key) ?? fallback
    }

    func bool(_ key: Key) -> Bool {
        if let flag: Bool = value(key) { return flag }
        if let number: Int = value(key) { return number != 0 } // tolerate SQLite-style 0/1
        return false
    }

    /// A whole number that may arrive as 12 or 12.0.
    func optionalInt(_ key: Key) -> Int? {
        if let number: Int = value(key) { return number }
        if let number: Double = value(key), number.isFinite, abs(number) < 9e15 { return Int(number) }
        return nil
    }

    func int(_ key: Key) -> Int {
        optionalInt(key) ?? 0
    }

    func optionalDouble(_ key: Key) -> Double? {
        value(key)
    }

    func double(_ key: Key) -> Double {
        optionalDouble(key) ?? 0
    }

    /// A list that skips items it can't decode instead of failing completely.
    func list<T: Decodable>(_ key: Key) -> [T] {
        guard var array = try? nestedUnkeyedContainer(forKey: key) else { return [] }
        return array.decodeSkippingFailures()
    }
}

extension UnkeyedDecodingContainer {
    /// Decodes every element that works and steps over the ones that don't.
    mutating func decodeSkippingFailures<T: Decodable>() -> [T] {
        var items: [T] = []
        while !isAtEnd {
            if let item = try? decode(T.self) {
                items.append(item)
            } else if (try? decode(SkipValue.self)) == nil {
                break // couldn't even step over the bad element; stop rather than loop forever
            }
        }
        return items
    }
}

/// Decodes any JSON value without reading it. Used to step over a list item that failed to decode.
private struct SkipValue: Decodable {
    init(from decoder: Decoder) throws {}
}

/// A top-level JSON array decoded with the same skip-the-broken-items rule (used by API.swift).
struct LossyList<Item: Decodable>: Decodable {
    var items: [Item]

    init(from decoder: Decoder) throws {
        var array = try decoder.unkeyedContainer()
        items = array.decodeSkippingFailures()
    }
}

// MARK: - Live events

extension LiveEvent: Decodable {
    /// Every key any event uses. Each event is a flat JSON object with a "type" field.
    private enum Keys: String, CodingKey {
        case type, badges, notification, post, postId, likeCount, commentCount, viewCount, shareCount,
             likedBy, comment, commentId, likedByAuthor, story, storyId, message, conversation,
             conversationId, messageId, reactions, accountId, typing, followers, following, postCount,
             aura, verified, tier, account, title, body, avatar, href, authorId
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        let type = c.string(.type)
        switch type {
        case "hello":
            self = .hello(badges: c.value(.badges))
        case "notification":
            self = .notification(try c.decode(AuraNotification.self, forKey: .notification), badges: c.value(.badges))
        case "post.new":
            self = .postNew(try c.decode(Post.self, forKey: .post))
        case "post.stats":
            self = .postStats(PostStats(
                postId: try c.decode(String.self, forKey: .postId),
                likeCount: c.int(.likeCount),
                commentCount: c.int(.commentCount),
                viewCount: c.int(.viewCount),
                shareCount: c.int(.shareCount),
                likedBy: c.value(.likedBy)))
        case "post.deleted":
            self = .postDeleted(postId: try c.decode(String.self, forKey: .postId))
        case "comment.new":
            self = .commentNew(try c.decode(Comment.self, forKey: .comment))
        case "comment.stats":
            self = .commentStats(CommentStats(
                postId: c.string(.postId),
                commentId: try c.decode(String.self, forKey: .commentId),
                likeCount: c.int(.likeCount),
                likedByAuthor: c.bool(.likedByAuthor)))
        case "comment.deleted":
            self = .commentDeleted(postId: c.string(.postId), commentId: try c.decode(String.self, forKey: .commentId))
        case "story.deleted":
            self = .storyDeleted(storyId: try c.decode(String.self, forKey: .storyId), authorId: c.string(.authorId))
        case "story.new":
            self = .storyNew(try c.decode(Story.self, forKey: .story))
        case "story.views":
            self = .storyViews(storyId: try c.decode(String.self, forKey: .storyId), viewCount: c.int(.viewCount))
        case "message.new":
            self = .messageNew(try c.decode(Message.self, forKey: .message),
                               conversation: try c.decode(Conversation.self, forKey: .conversation),
                               badges: c.value(.badges))
        case "message.reactions":
            self = .messageReactions(conversationId: c.string(.conversationId),
                                     messageId: try c.decode(String.self, forKey: .messageId),
                                     reactions: c.list(.reactions))
        case "typing":
            self = .typing(conversationId: try c.decode(String.self, forKey: .conversationId),
                           accountId: try c.decode(String.self, forKey: .accountId),
                           isTyping: c.bool(.typing))
        case "conversation.updated":
            self = .conversationUpdated(try c.decode(Conversation.self, forKey: .conversation), badges: c.value(.badges))
        case "conversation.deleted":
            self = .conversationDeleted(conversationId: try c.decode(String.self, forKey: .conversationId))
        case "badges":
            self = .badges(try c.decode(Badges.self, forKey: .badges))
        case "me.stats":
            self = .meStats(MeStats(followers: c.int(.followers), following: c.int(.following),
                                    postCount: c.int(.postCount), aura: c.int(.aura),
                                    verified: c.value(.verified), tier: c.value(.tier)))
        case "account.updated":
            self = .accountUpdated(try c.decode(Account.self, forKey: .account))
        case "milestone":
            self = .milestone(Milestone(title: c.string(.title), body: c.string(.body)))
        case "banner":
            self = .banner(Banner(title: c.string(.title), body: c.string(.body),
                                  avatar: c.value(.avatar), href: c.value(.href)))
        case "reset":
            self = .reset
        default:
            self = .unknown(type: type)
        }
    }
}
