import Foundation

// The Swift mirror of shared/types.ts (the API contract). Property names match the JSON keys exactly.
//
// Every response type decodes forgivingly (see Decoding.swift): a missing or null field falls back to
// a sensible default and one broken item in a list is skipped, so a small server change never blanks
// a whole screen. Only real identity fields (ids, a post's author, a message's sender) are required.
//
// The custom `init(from:)` lives in an extension so Swift still generates the memberwise init
// (handy for building optimistic copies, e.g. a message that is still sending).

/// Milliseconds since 1970, exactly what the server's Date.now() returns.
typealias Millis = Double

// MARK: - Small enums

/// How popular the user is. Scales follower counts and engagement.
enum Tier: String, Codable, CaseIterable, Identifiable {
    case rising, popular, influencer, icon

    var id: String { rawValue }

    // Copied from TIERS in server/config.ts so onboarding and Settings can describe each tier.
    var label: String {
        switch self {
        case .rising: "Rising"
        case .popular: "Popular"
        case .influencer: "Influencer"
        case .icon: "Icon"
        }
    }

    var blurb: String {
        switch self {
        case .rising: "Local legend. Everyone knows your name."
        case .popular: "Campus famous. Your posts are an event."
        case .influencer: "Brands DM you. Strangers know your face."
        case .icon: "A household name. Every post breaks the internet."
        }
    }

    var followers: Int {
        switch self {
        case .rising: 2_800
        case .popular: 48_000
        case .influencer: 620_000
        case .icon: 8_400_000
        }
    }
}

/// How fast the simulated world moves.
enum Speed: String, Codable, CaseIterable, Identifiable {
    case realtime, fast, instant

    var id: String { rawValue }

    // Copied from SPEEDS in server/config.ts.
    var label: String {
        switch self {
        case .realtime: "Real time"
        case .fast: "Fast"
        case .instant: "Instant"
        }
    }
}

/// Which Claude model writes the comments, DMs and group chats.
enum AiModel: String, Codable, CaseIterable, Identifiable {
    case opus, sonnet, haiku

    var id: String { rawValue }

    var label: String {
        switch self {
        case .opus: "Claude Opus"
        case .sonnet: "Claude Sonnet"
        case .haiku: "Claude Haiku"
        }
    }
}

/// The part an AI character plays in the user's life.
enum Role: String, Codable {
    case bestie, friend, mutual, fan, creator
}

/// me = the human, cast = named AI characters, crowd = background followers.
enum AccountKind: String, Codable {
    case me, cast, crowd
}

enum MediaType: String, Codable {
    case image, video
}

enum PostKind: String, Codable {
    case photo, carousel, reel
}

enum ConversationKind: String, Codable {
    case dm, group
}

enum ProviderKind: String, Codable {
    case anthropic
    case claudeCli = "claude-cli"
    case offline
}

enum NotificationKind: String, Codable {
    case like                            // liked your post (merged: actor + others)
    case comment                         // commented on your post
    case reply                           // replied to your comment
    case mention                         // mentioned you in a comment
    case commentLike = "comment_like"    // liked your comment
    case follow                          // started following you (merged: actor + others)
    case storyReaction = "story_reaction" // reacted to your story (text = emoji)
    case tag                             // tagged you in a post
    case milestone                       // "You hit 50K followers" (actor is nil)
}

/// The `tab` query of GET /api/accounts/:username/posts.
enum ProfileTab: String, CaseIterable, Identifiable {
    case posts, reels, tagged

    var id: String { rawValue }
}

// MARK: - Media and accounts

struct Media: Codable, Hashable {
    var url: String
    var type: MediaType
    var width: Int?
    var height: Int?
    /// Videos only: a still frame used for grid thumbnails.
    var poster: String?

    var isVideo: Bool { type == .video }

    /// The picture to show in grids and previews (a video's poster frame).
    var thumbnail: String { isVideo ? (poster ?? url) : url }

    /// width / height, or nil when the size is unknown.
    var aspectRatio: Double? {
        guard let width, let height, width > 0, height > 0 else { return nil }
        return Double(width) / Double(height)
    }
}

/// Small account summary used everywhere (post headers, comment authors, lists, chat members).
struct Account: Codable, Identifiable, Hashable {
    var id: String
    var kind: AccountKind
    var username: String
    var displayName: String
    var avatar: String?
    var verified: Bool
    var role: Role?
    var followsMe: Bool
    var iFollow: Bool
    var hasStory: Bool          // has at least one unexpired story
    var storySeen: Bool         // I have seen all of their current stories
    var lastActiveAt: Millis?   // "Active now" when within the last 5 minutes

    var isMe: Bool { kind == .me }

    var isActiveNow: Bool {
        guard let lastActiveAt else { return false }
        return Date().timeIntervalSince(Date(millis: lastActiveAt)) < 5 * 60
    }
}

/// A full profile page (an Account plus profile details).
struct Profile: Codable, Identifiable, Hashable {
    // Account fields
    var id: String
    var kind: AccountKind
    var username: String
    var displayName: String
    var avatar: String?
    var verified: Bool
    var role: Role?
    var followsMe: Bool
    var iFollow: Bool
    var hasStory: Bool
    var storySeen: Bool
    var lastActiveAt: Millis?
    // Profile fields
    var bio: String
    var pronouns: String
    var location: String?
    var occupation: String?
    var followers: Int
    var following: Int
    var postCount: Int
    var mutuals: [Account]      // up to 3, for "Followed by maya.chen, dev.k and 12 others"
    var mutualCount: Int
    var isMe: Bool
    var highlights: [Highlight]

    /// The small summary of this profile (for AvatarView, FollowButton, UserRow...).
    var account: Account {
        Account(id: id, kind: kind, username: username, displayName: displayName, avatar: avatar,
                verified: verified, role: role, followsMe: followsMe, iFollow: iFollow,
                hasStory: hasStory, storySeen: storySeen, lastActiveAt: lastActiveAt)
    }
}

struct Highlight: Codable, Identifiable, Hashable {
    var id: String
    var title: String
    var cover: String
    var storyIds: [String]
}

/// The human using the app (a Profile plus tier, interests and aura).
struct Me: Codable, Identifiable, Hashable {
    // Account fields
    var id: String
    var kind: AccountKind
    var username: String
    var displayName: String
    var avatar: String?
    var verified: Bool
    var role: Role?
    var followsMe: Bool
    var iFollow: Bool
    var hasStory: Bool
    var storySeen: Bool
    var lastActiveAt: Millis?
    // Profile fields
    var bio: String
    var pronouns: String
    var location: String?
    var occupation: String?
    var followers: Int
    var following: Int
    var postCount: Int
    var mutuals: [Account]
    var mutualCount: Int
    var isMe: Bool
    var highlights: [Highlight]
    // Me fields
    var tier: Tier
    var interests: [String]
    var aura: Int               // playful score that climbs as people engage with you

    var account: Account {
        Account(id: id, kind: kind, username: username, displayName: displayName, avatar: avatar,
                verified: verified, role: role, followsMe: followsMe, iFollow: iFollow,
                hasStory: hasStory, storySeen: storySeen, lastActiveAt: lastActiveAt)
    }

    var profile: Profile {
        Profile(id: id, kind: kind, username: username, displayName: displayName, avatar: avatar,
                verified: verified, role: role, followsMe: followsMe, iFollow: iFollow,
                hasStory: hasStory, storySeen: storySeen, lastActiveAt: lastActiveAt, bio: bio,
                pronouns: pronouns, location: location, occupation: occupation, followers: followers,
                following: following, postCount: postCount, mutuals: mutuals, mutualCount: mutualCount,
                isMe: true, highlights: highlights)
    }
}

// MARK: - Posts and comments

struct Post: Codable, Identifiable, Hashable {
    var id: String
    var author: Account
    /// photo: 1 image. carousel: 2-10 images. reel: one video, or several images played as a motion reel.
    var kind: PostKind
    var media: [Media]
    var caption: String
    var location: String?
    var tagged: [Account]
    var audio: String?          // reels: e.g. "original audio · maya.chen"
    var likeCount: Int
    var commentCount: Int
    var viewCount: Int          // reels only
    var shareCount: Int
    var likedByMe: Bool
    var savedByMe: Bool
    var likedBy: Account?       // best-known liker for "Liked by maya.chen and 1,203 others"
    var previewComments: [Comment] // up to 2, shown under the post in the feed
    var createdAt: Millis
    var suggested: Bool         // feed only: show a "Suggested for you" label

    var isReel: Bool { kind == .reel }

    /// The picture for grids and share previews.
    var thumbnail: String? { media.first?.thumbnail }

    /// A good shape for showing this post in the feed: its first image's ratio, kept between 4:5 and 1.91:1.
    var feedAspectRatio: Double {
        let ratio = media.first?.aspectRatio ?? 0.8
        return min(max(ratio, 0.8), 1.91)
    }
}

struct Comment: Codable, Identifiable, Hashable {
    var id: String
    var postId: String
    var author: Account
    var text: String
    var parentId: String?       // set on replies
    var likeCount: Int
    var likedByMe: Bool
    var likedByAuthor: Bool     // the post's author hearted this comment
    var pinned: Bool
    var createdAt: Millis
    var replies: [Comment]      // only on top-level comments from GET /api/posts/:id/comments
}

// MARK: - Stories

struct StoryOverlay: Codable, Hashable {
    var text: String?
    var color: String?          // text color, e.g. "#ffffff" (Color(css:) reads it)
    var background: String?     // text pill background, e.g. "rgba(0,0,0,0.45)" or nil for none
    var y: Double?              // 0...1 vertical position of the text (0.5 = middle)
}

struct Story: Codable, Identifiable, Hashable {
    var id: String
    var author: Account
    var media: Media
    var overlay: StoryOverlay?
    var createdAt: Millis
    var expiresAt: Millis
    var seen: Bool
    var viewCount: Int          // only meaningful on my own stories
}

struct StoryTray: Codable, Identifiable, Hashable {
    var author: Account
    var stories: [Story]        // oldest first
    var allSeen: Bool
    var latestAt: Millis

    var id: String { author.id }
}

// MARK: - Notifications

/// `Notification` in shared/types.ts (renamed so it doesn't clash with Foundation's Notification).
struct AuraNotification: Codable, Identifiable, Hashable {
    var id: String
    var kind: NotificationKind
    var actor: Account?
    var others: Int             // "and 1,203 others"
    var postId: String?
    var postThumb: String?
    var commentId: String?
    var text: String?           // comment text, reaction emoji, or milestone message
    var createdAt: Millis
    var read: Bool
}

// MARK: - Messages

struct Reaction: Codable, Hashable {
    var accountId: String
    var emoji: String
}

/// The story a message replies to.
struct StoryRef: Codable, Hashable {
    var id: String
    var thumb: String
}

/// The message a message quotes.
struct ReplyRef: Codable, Hashable {
    var id: String
    var text: String
    var senderName: String
}

struct Message: Codable, Identifiable, Hashable {
    var id: String
    var conversationId: String
    var sender: Account         // sender.kind == .me for my own messages
    var text: String
    var media: Media?
    var sharedPost: Post?       // a post sent into the chat
    var story: StoryRef?        // this message replies to a story
    var replyTo: ReplyRef?
    var reactions: [Reaction]
    var createdAt: Millis

    var isMine: Bool { sender.kind == .me }
}

struct Conversation: Codable, Identifiable, Hashable {
    var id: String
    var kind: ConversationKind
    var title: String           // DM: the other person's display name. Group: the group name.
    var emoji: String?          // group icon (DMs use the member's avatar)
    var members: [Account]      // everyone except me
    var isRequest: Bool         // a message request from someone I don't follow
    var muted: Bool
    var unread: Int
    var lastMessage: Message?
    var lastMessageAt: Millis
    var typing: [String]        // ids of members typing right now
    var seenAt: Millis?         // DMs: when the other person last read my messages

    var isGroup: Bool { kind == .group }
}

// MARK: - Session, settings, badges

struct ProviderInfo: Codable, Hashable {
    var active: ProviderKind
    var detail: String          // e.g. "Claude Code login · claude-opus-5-5"
}

/// `Settings` in shared/types.ts.
struct AuraSettings: Codable, Hashable {
    var tier: Tier
    var speed: Speed
    var model: AiModel
    var provider: ProviderInfo
}

struct Badges: Codable, Hashable {
    var notifications: Int = 0  // unread notifications
    var messages: Int = 0       // conversations with unread messages (requests excluded)
}

struct Page<Item: Decodable>: Decodable {
    var items: [Item]
    var nextCursor: String?
}

/// GET /api/session - the first call the app makes.
struct Session: Codable {
    var onboarded: Bool
    var me: Me?
    var settings: AuraSettings
    var badges: Badges
}

struct Health: Codable {
    var ok: Bool
    var onboarded: Bool
    var provider: ProviderInfo
    var castCount: Int
    var imagesReady: Int
    var imagesTotal: Int
}

// MARK: - Request and response bodies

struct OnboardingRequest: Codable {
    var displayName: String
    var username: String
    var avatar: String?         // URL from POST /api/upload or one of GET /api/avatars
    var bio: String
    var pronouns: String
    var interests: [String]     // e.g. ["music", "food", "fitness"]
    var tier: Tier
    var origin: String          // "college" | "high school" | "work" | "online" | "hometown"
}

/// Only the fields you set are sent; nil means "leave unchanged".
struct UpdateMeRequest: Codable {
    var displayName: String?
    var username: String?
    var avatar: String?
    var bio: String?
    var pronouns: String?
    var interests: [String]?
}

struct UpdateSettingsRequest: Codable {
    var tier: Tier?
    var speed: Speed?
    var model: AiModel?
}

struct UploadResponse: Codable {
    var url: String
    var type: MediaType
    var width: Int?
    var height: Int?
}

struct CreatePostRequest: Codable {
    var kind: PostKind
    var media: [Media]
    var caption: String
    var location: String?
    var taggedIds: [String]?
}

struct LikeResponse: Codable { var likeCount: Int; var likedByMe: Bool }
struct SaveResponse: Codable { var savedByMe: Bool }
struct ViewResponse: Codable { var viewCount: Int }
struct ShareRequest: Codable { var conversationIds: [String]; var text: String? }
struct LikesResponse: Codable { var accounts: [Account]; var total: Int }

struct CreateCommentRequest: Codable {
    var text: String
    var parentId: String?       // reply to this top-level comment
}

struct CommentLikeResponse: Codable { var likeCount: Int; var likedByMe: Bool }
/// POST /api/comments/:id/pin
struct PinResponse: Codable { var pinned: Bool }

struct CreateStoryRequest: Codable {
    var media: Media
    var overlay: StoryOverlay?
}

struct StoryReplyRequest: Codable { var text: String }
struct StoryReplyResponse: Codable { var conversationId: String }
struct StoryReactRequest: Codable { var emoji: String }

/// One person who viewed my story (`viewers[]` in ViewersResponse).
struct Viewer: Codable, Hashable {
    var account: Account
    var reaction: String?
}

struct ViewersResponse: Codable {
    var viewers: [Viewer]
    var total: Int              // total views (named viewers + crowd)
}

struct FollowListResponse: Codable {
    var accounts: [Account]
    var total: Int
    var nextCursor: String?
}

/// A hashtag in search results.
struct TagResult: Codable, Hashable, Identifiable {
    var tag: String
    var postCount: Int

    var id: String { tag }
}

struct SearchResult: Codable {
    var accounts: [Account]
    var tags: [TagResult]
}

struct ConversationsResponse: Codable {
    var conversations: [Conversation] // newest activity first, requests excluded
    var requests: [Conversation]
}

struct CreateConversationRequest: Codable {
    var memberIds: [String]     // one id = DM (reuses an existing DM); 2+ = group
    var title: String?
}

struct UpdateConversationRequest: Codable {
    var title: String?
    var emoji: String?
    var muted: Bool?
}

struct SendMessageRequest: Codable {
    var text: String?
    var media: Media?
    var sharedPostId: String?
    var replyToId: String?
}

/// `emoji: nil` removes my reaction, so nil is sent as an explicit JSON null.
struct ReactRequest: Encodable {
    var emoji: String?

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(emoji, forKey: .emoji)
    }

    private enum CodingKeys: String, CodingKey { case emoji }
}

// MARK: - Live events (GET /api/live)

/// post.stats: new numbers for one post.
struct PostStats: Hashable {
    var postId: String
    var likeCount: Int
    var commentCount: Int
    var viewCount: Int
    var shareCount: Int
    var likedBy: Account?
}

/// comment.stats: new numbers for one comment.
struct CommentStats: Hashable {
    var postId: String
    var commentId: String
    var likeCount: Int
    var likedByAuthor: Bool
}

/// me.stats: my own counters changed.
struct MeStats: Hashable {
    var followers: Int
    var following: Int
    var postCount: Int
    var aura: Int
    var verified: Bool?         // sent so a tier change shows the verified badge right away
    var tier: Tier?
}

/// A push-notification-style banner that slides in at the top. `href` is an in-app path like "/messages/c_123".
struct Banner: Identifiable, Hashable {
    var id = UUID()
    var title: String
    var body: String
    var avatar: String?
    var href: String?
}

/// A big moment ("You just hit 50K followers") shown as a celebration.
struct Milestone: Identifiable, Hashable {
    var id = UUID()
    var title: String
    var body: String
}

/// One event from the server's live stream. Unknown event types decode as `.unknown` and are ignored.
enum LiveEvent {
    case hello(badges: Badges?)
    /// Insert, or replace by id (merged notifications are updated in place and move to the top).
    case notification(AuraNotification, badges: Badges?)
    case postNew(Post)
    case postStats(PostStats)
    case postDeleted(postId: String)
    /// comment.parentId is set for replies.
    case commentNew(Comment)
    case commentStats(CommentStats)
    case commentDeleted(postId: String, commentId: String)
    case storyNew(Story)
    case storyViews(storyId: String, viewCount: Int)
    case storyDeleted(storyId: String, authorId: String)
    case messageNew(Message, conversation: Conversation, badges: Badges?)
    case messageReactions(conversationId: String, messageId: String, reactions: [Reaction])
    case typing(conversationId: String, accountId: String, isTyping: Bool)
    /// Seen receipts, unread counts, rename/mute, a request accepted, a new conversation.
    case conversationUpdated(Conversation, badges: Badges?)
    case conversationDeleted(conversationId: String)
    /// Fresh unread counts (for example after reading notifications on another device).
    case badges(Badges)
    case meStats(MeStats)
    /// Follow state, story ring or "Active now" changed for someone.
    case accountUpdated(Account)
    case milestone(Milestone)
    case banner(Banner)
    /// The world was reset (Settings > Start over): go back to onboarding.
    case reset
    case unknown(type: String)
}

// MARK: - Decoding
//
// Each type's forgiving decoder. They live in this file because Swift keeps the generated
// `CodingKeys` private to the file that declares the type. The helpers (`c.value`, `c.int`,
// `c.list`...) are in Decoding.swift.

// MARK: Decoding media and accounts

extension Media {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        url = try c.decode(String.self, forKey: .url)
        type = c.value(.type) ?? .image
        width = c.optionalInt(.width)
        height = c.optionalInt(.height)
        poster = c.value(.poster)
    }
}

extension Account {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = c.value(.kind) ?? .crowd
        username = c.string(.username)
        displayName = c.string(.displayName)
        avatar = c.value(.avatar)
        verified = c.bool(.verified)
        role = c.value(.role)
        followsMe = c.bool(.followsMe)
        iFollow = c.bool(.iFollow)
        hasStory = c.bool(.hasStory)
        storySeen = c.bool(.storySeen)
        lastActiveAt = c.optionalDouble(.lastActiveAt)
    }
}

extension Profile {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = c.value(.kind) ?? .cast
        username = c.string(.username)
        displayName = c.string(.displayName)
        avatar = c.value(.avatar)
        verified = c.bool(.verified)
        role = c.value(.role)
        followsMe = c.bool(.followsMe)
        iFollow = c.bool(.iFollow)
        hasStory = c.bool(.hasStory)
        storySeen = c.bool(.storySeen)
        lastActiveAt = c.optionalDouble(.lastActiveAt)
        bio = c.string(.bio)
        pronouns = c.string(.pronouns)
        location = c.value(.location)
        occupation = c.value(.occupation)
        followers = c.int(.followers)
        following = c.int(.following)
        postCount = c.int(.postCount)
        mutuals = c.list(.mutuals)
        mutualCount = c.int(.mutualCount)
        isMe = c.bool(.isMe) || kind == .me
        highlights = c.list(.highlights)
    }
}

extension Highlight {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = c.string(.title)
        cover = c.string(.cover)
        storyIds = c.value(.storyIds) ?? []
    }
}

extension Me {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.string(.id, default: "me")
        kind = .me
        username = c.string(.username)
        displayName = c.string(.displayName)
        avatar = c.value(.avatar)
        verified = c.bool(.verified)
        role = nil
        followsMe = c.bool(.followsMe)
        iFollow = c.bool(.iFollow)
        hasStory = c.bool(.hasStory)
        storySeen = c.bool(.storySeen)
        lastActiveAt = c.optionalDouble(.lastActiveAt)
        bio = c.string(.bio)
        pronouns = c.string(.pronouns)
        location = c.value(.location)
        occupation = c.value(.occupation)
        followers = c.int(.followers)
        following = c.int(.following)
        postCount = c.int(.postCount)
        mutuals = c.list(.mutuals)
        mutualCount = c.int(.mutualCount)
        isMe = true
        highlights = c.list(.highlights)
        tier = c.value(.tier) ?? .rising
        interests = c.value(.interests) ?? []
        aura = c.int(.aura)
    }
}

// MARK: Decoding posts and comments

extension Post {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        author = try c.decode(Account.self, forKey: .author)
        kind = c.value(.kind) ?? .photo
        media = c.list(.media)
        caption = c.string(.caption)
        location = c.value(.location)
        tagged = c.list(.tagged)
        audio = c.value(.audio)
        likeCount = c.int(.likeCount)
        commentCount = c.int(.commentCount)
        viewCount = c.int(.viewCount)
        shareCount = c.int(.shareCount)
        likedByMe = c.bool(.likedByMe)
        savedByMe = c.bool(.savedByMe)
        likedBy = c.value(.likedBy)
        previewComments = c.list(.previewComments)
        createdAt = c.double(.createdAt)
        suggested = c.bool(.suggested)
    }
}

extension Comment {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        postId = c.string(.postId)
        author = try c.decode(Account.self, forKey: .author)
        text = c.string(.text)
        parentId = c.value(.parentId)
        likeCount = c.int(.likeCount)
        likedByMe = c.bool(.likedByMe)
        likedByAuthor = c.bool(.likedByAuthor)
        pinned = c.bool(.pinned)
        createdAt = c.double(.createdAt)
        replies = c.list(.replies)
    }
}

// MARK: Decoding stories

extension StoryOverlay {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        text = c.value(.text)
        color = c.value(.color)
        background = c.value(.background)
        y = c.optionalDouble(.y)
    }
}

extension Story {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        author = try c.decode(Account.self, forKey: .author)
        media = try c.decode(Media.self, forKey: .media)
        overlay = c.value(.overlay)
        createdAt = c.double(.createdAt)
        expiresAt = c.double(.expiresAt)
        seen = c.bool(.seen)
        viewCount = c.int(.viewCount)
    }
}

extension StoryTray {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        author = try c.decode(Account.self, forKey: .author)
        stories = c.list(.stories)
        allSeen = c.bool(.allSeen)
        latestAt = c.double(.latestAt)
    }
}

// MARK: Decoding notifications and messages

extension AuraNotification {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        // An unknown kind throws, so a list simply skips notifications this app can't show yet.
        kind = try c.decode(NotificationKind.self, forKey: .kind)
        actor = c.value(.actor)
        others = c.int(.others)
        postId = c.value(.postId)
        postThumb = c.value(.postThumb)
        commentId = c.value(.commentId)
        text = c.value(.text)
        createdAt = c.double(.createdAt)
        read = c.bool(.read)
    }
}

extension Reaction {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        accountId = try c.decode(String.self, forKey: .accountId)
        emoji = try c.decode(String.self, forKey: .emoji)
    }
}

extension StoryRef {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        thumb = c.string(.thumb)
    }
}

extension ReplyRef {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        text = c.string(.text)
        senderName = c.string(.senderName)
    }
}

extension Message {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        conversationId = c.string(.conversationId)
        sender = try c.decode(Account.self, forKey: .sender)
        text = c.string(.text)
        media = c.value(.media)
        sharedPost = c.value(.sharedPost)
        story = c.value(.story)
        replyTo = c.value(.replyTo)
        reactions = c.list(.reactions)
        createdAt = c.double(.createdAt)
    }
}

extension Conversation {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = c.value(.kind) ?? .dm
        title = c.string(.title)
        emoji = c.value(.emoji)
        members = c.list(.members)
        isRequest = c.bool(.isRequest)
        muted = c.bool(.muted)
        unread = c.int(.unread)
        lastMessage = c.value(.lastMessage)
        lastMessageAt = c.double(.lastMessageAt)
        typing = c.value(.typing) ?? []
        seenAt = c.optionalDouble(.seenAt)
    }
}

// MARK: Decoding session, settings, pages

extension ProviderInfo {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        active = c.value(.active) ?? .offline
        detail = c.string(.detail)
    }
}

extension AuraSettings {
    /// Used when the server leaves settings out.
    static let fallback = AuraSettings(tier: .rising, speed: .fast, model: .opus,
                                       provider: ProviderInfo(active: .offline, detail: ""))

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        tier = c.value(.tier) ?? .rising
        speed = c.value(.speed) ?? .fast
        model = c.value(.model) ?? .opus
        provider = c.value(.provider) ?? AuraSettings.fallback.provider
    }
}

extension Badges {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        notifications = c.int(.notifications)
        messages = c.int(.messages)
    }
}

extension Page {
    private enum CodingKeys: String, CodingKey { case items, nextCursor }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        items = c.list(.items)
        nextCursor = c.value(.nextCursor)
    }
}

extension Session {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        onboarded = c.bool(.onboarded)
        me = c.value(.me)
        settings = c.value(.settings) ?? .fallback
        badges = c.value(.badges) ?? Badges()
    }
}

extension Health {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        ok = c.bool(.ok)
        onboarded = c.bool(.onboarded)
        provider = c.value(.provider) ?? AuraSettings.fallback.provider
        castCount = c.int(.castCount)
        imagesReady = c.int(.imagesReady)
        imagesTotal = c.int(.imagesTotal)
    }
}

// MARK: Decoding response bodies with lists

extension LikesResponse {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        accounts = c.list(.accounts)
        total = c.int(.total)
    }
}

extension Viewer {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        account = try c.decode(Account.self, forKey: .account)
        reaction = c.value(.reaction)
    }
}

extension ViewersResponse {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        viewers = c.list(.viewers)
        total = c.int(.total)
    }
}

extension FollowListResponse {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        accounts = c.list(.accounts)
        total = c.int(.total)
        nextCursor = c.value(.nextCursor)
    }
}

extension TagResult {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        tag = try c.decode(String.self, forKey: .tag)
        postCount = c.int(.postCount)
    }
}

extension SearchResult {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        accounts = c.list(.accounts)
        tags = c.list(.tags)
    }
}

extension ConversationsResponse {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        conversations = c.list(.conversations)
        requests = c.list(.requests)
    }
}
