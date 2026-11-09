import Foundation

// The Swift mirror of the newer parts of shared/types.ts: the signed-in Google account, the world
// plan made during sign-up, and the tracking events the recommendation algorithm learns from.
// They decode as forgivingly as everything in Models.swift (helpers in Decoding.swift).

// MARK: - Signing in

/// The Google account behind a session. Each account has its own separate Aura world.
struct SignedInAccount: Codable, Hashable {
    var id: String
    var email: String
    var name: String
    /// A full https address on Google's image host, or nil.
    var picture: String?
}

/// What POST /auth/dev answers (the test-only sign-in that debug builds offer).
struct DevSignInResponse: Decodable {
    var token: String
    var account: SignedInAccount?
}

// MARK: - The world plan (POST /api/onboarding/plan)

/// What the person said or typed about the world they want.
struct WorldPlanRequest: Codable {
    var transcript: String
    /// Their Google account's name, when we know it.
    var displayName: String?
}

/// The world the AI planned from what the person said. They look it over (and can change their
/// profile, interests and tier) before "Build my world" sends it back with POST /api/onboarding.
struct WorldPlan: Codable, Hashable {
    var displayName: String
    var username: String        // a suggestion; the person can change it
    var bio: String
    var pronouns: String
    var interests: [String]
    var origin: String          // how they know their friends, in their own words
    var tier: Tier
    var summary: String         // one or two warm sentences about the world we're about to build
    var friends: [PlanFriend]
    var groupChats: [PlanGroupChat]
    /// People they described whom no character fits; they are created in the background.
    var newFriends: [PlanNewFriend]
    /// Facts about the person that every character knows from the start.
    var memories: [String]
}

/// A character picked as one of their people, with the relationship told around what they said.
struct PlanFriend: Codable, Hashable {
    var id: String
    var role: Role
    var relationship: String
    /// A preview of the character (picture, name), or nil when the server couldn't make one.
    var account: Account?
}

struct PlanGroupChat: Codable, Hashable {
    var title: String
    var emoji: String
    var vibe: String
    var memberIds: [String]
}

struct PlanNewFriend: Codable, Hashable {
    var name: String
    var description: String
    var role: Role
}

// MARK: - Tracking (POST /api/events)

/// The quiet signals only the app can see. Likes, comments, follows and shares the server already
/// learns from their own requests.
enum TrackEventType: String, Codable {
    case impression                    // a post was at least half on screen for 1 s or more (ms)
    case open                          // opened a post's page or its comments
    case profileView = "profile_view"  // opened someone's profile (accountId)
    case reelWatch = "reel_watch"      // time on a reel (ms), complete = played to the end
    case storyView = "story_view"      // looked at a story (ms)
    case storySkip = "story_skip"      // tapped past a story within 1.5 s
    case search                        // searched (query)
    case tagOpen = "tag_open"          // opened a hashtag page (tag)
}

/// One event. Only the fields that matter for its type are set; nil fields are left out of the JSON.
struct TrackEvent: Codable {
    var type: TrackEventType
    var postId: String?
    var accountId: String?
    var storyId: String?
    var ms: Int?
    var complete: Bool?
    var query: String?
    var tag: String?
    var at: Millis = Date().millis
}

struct TrackRequest: Codable {
    var events: [TrackEvent]
}

// MARK: - Decoding

extension SignedInAccount {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        email = c.string(.email)
        name = c.string(.name)
        picture = c.value(.picture)
    }
}

extension WorldPlan {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        displayName = c.string(.displayName)
        username = c.string(.username)
        bio = c.string(.bio)
        pronouns = c.string(.pronouns)
        interests = c.list(.interests)
        origin = c.string(.origin)
        tier = c.value(.tier) ?? .popular
        summary = c.string(.summary)
        friends = c.list(.friends)
        groupChats = c.list(.groupChats)
        newFriends = c.list(.newFriends)
        memories = c.list(.memories)
    }
}

extension PlanFriend {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        role = c.value(.role) ?? .friend
        relationship = c.string(.relationship)
        account = c.value(.account)
    }
}

extension PlanGroupChat {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        title = c.string(.title)
        emoji = c.string(.emoji, default: "💬")
        vibe = c.string(.vibe)
        memberIds = c.list(.memberIds)
    }
}

extension PlanNewFriend {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = try c.decode(String.self, forKey: .name)
        description = c.string(.description)
        role = c.value(.role) ?? .friend
    }
}
