import Foundation

/// A readable error from the Aura server or the network. `message` is safe to show to the user.
struct APIError: LocalizedError {
    var message: String
    var status: Int? = nil

    var errorDescription: String? { message }
}

extension Error {
    /// True when a task was cancelled (a view went away). Views should ignore these instead of showing an error.
    var isCancellation: Bool {
        self is CancellationError || (self as? URLError)?.code == .cancelled
    }
}

/// One async function per server endpoint (SPEC section 5). They all throw `APIError`.
///
///     let page = try await API.feed()
///     let post = try await API.likePost(post.id)
///
/// Prefer the AppStore methods for anything that changes data the whole app shows (likes, follows,
/// messages...). Call API directly for reads that only one screen needs (a profile, a list of likers).
enum API {
    // MARK: - Server address

    /// UserDefaults key for the server address. The launch argument `-AuraServer http://host:port` sets it too.
    static let serverKey = "AuraServer"
    static let defaultServer = "http://localhost:8790"

    /// The server address without a trailing slash, e.g. "http://localhost:8790".
    static var server: String {
        let saved = UserDefaults.standard.string(forKey: serverKey) ?? ""
        var address = saved.trimmingCharacters(in: .whitespacesAndNewlines)
        if address.isEmpty { address = defaultServer }
        if !address.contains("://") { address = "http://" + address }
        while address.hasSuffix("/") { address.removeLast() }
        return address
    }

    /// Turns a media path from the server ("/content/images/maya/p1.webp") into a full URL.
    /// Full URLs are returned as they are; nil or "" gives nil.
    static func mediaURL(_ path: String?) -> URL? {
        guard let path, !path.isEmpty else { return nil }
        if path.hasPrefix("http://") || path.hasPrefix("https://") || path.hasPrefix("file://") {
            return URL(string: path)
        }
        let slashed = path.hasPrefix("/") ? path : "/" + path
        return URL(string: server + slashed)
            ?? URL(string: server + (slashed.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? slashed))
    }

    /// The live event stream (Server-Sent Events). LiveStream connects to it.
    static func liveURL() throws -> URL {
        try makeURL("/live")
    }

    // MARK: - Session, onboarding, settings

    static func session() async throws -> Session { try await get("/session") }
    static func health() async throws -> Health { try await get("/health") }
    /// Preset avatar URLs for onboarding and Edit profile.
    static func avatars() async throws -> [String] { try await getList("/avatars") }
    /// Builds the whole world (takes a few seconds).
    static func onboard(_ body: OnboardingRequest) async throws -> Session { try await send("POST", "/onboarding", body: body) }
    static func updateMe(_ body: UpdateMeRequest) async throws -> Me { try await send("PATCH", "/me", body: body) }
    static func settings() async throws -> AuraSettings { try await get("/settings") }
    static func updateSettings(_ body: UpdateSettingsRequest) async throws -> AuraSettings { try await send("PATCH", "/settings", body: body) }
    /// Settings > Start over. Wipes the world.
    static func reset() async throws { try await call("POST", "/reset") }
    static func badges() async throws -> Badges { try await get("/badges") }

    /// Uploads raw bytes (an image or a video). Uploader.swift resizes photos before calling this.
    static func upload(_ data: Data, contentType: String, width: Int?, height: Int?) async throws -> UploadResponse {
        let request = try uploadRequest(contentType: contentType, width: width, height: height)
        return try decode(UploadResponse.self, from: try await transfer { try await session.upload(for: request, from: data) }, path: "/upload")
    }

    /// Uploads a file from disk without loading it into memory (videos).
    static func upload(fileAt fileURL: URL, contentType: String, width: Int?, height: Int?) async throws -> UploadResponse {
        let request = try uploadRequest(contentType: contentType, width: width, height: height)
        return try decode(UploadResponse.self, from: try await transfer { try await session.upload(for: request, fromFile: fileURL) }, path: "/upload")
    }

    // MARK: - Feed, posts, explore, reels

    /// Posts by me and people I follow, newest first, with a suggested post mixed in now and then.
    static func feed(cursor: String? = nil) async throws -> Page<Post> { try await get("/feed", query: ["cursor": cursor]) }
    /// `topic` filters by an interest word ("music"); nil = For you.
    static func explore(cursor: String? = nil, topic: String? = nil) async throws -> Page<Post> { try await get("/explore", query: ["cursor": cursor, "topic": topic]) }
    /// `start` puts that reel first.
    static func reels(cursor: String? = nil, start: String? = nil) async throws -> Page<Post> { try await get("/reels", query: ["cursor": cursor, "start": start]) }
    /// Posts whose caption has #tag (pass the tag without "#").
    static func tagPosts(_ tag: String, cursor: String? = nil) async throws -> Page<Post> { try await get("/tags/\(escape(tag))", query: ["cursor": cursor]) }
    static func saved(cursor: String? = nil) async throws -> Page<Post> { try await get("/saved", query: ["cursor": cursor]) }
    static func post(_ id: String) async throws -> Post { try await get("/posts/\(escape(id))") }
    static func createPost(_ body: CreatePostRequest) async throws -> Post { try await send("POST", "/posts", body: body) }
    static func deletePost(_ id: String) async throws { try await call("DELETE", "/posts/\(escape(id))") }
    static func likePost(_ id: String) async throws -> LikeResponse { try await send("POST", "/posts/\(escape(id))/like") }
    static func unlikePost(_ id: String) async throws -> LikeResponse { try await send("DELETE", "/posts/\(escape(id))/like") }
    static func savePost(_ id: String) async throws -> SaveResponse { try await send("POST", "/posts/\(escape(id))/save") }
    static func unsavePost(_ id: String) async throws -> SaveResponse { try await send("DELETE", "/posts/\(escape(id))/save") }
    /// Counts a reel view.
    static func viewPost(_ id: String) async throws -> ViewResponse { try await send("POST", "/posts/\(escape(id))/view") }
    /// Sends the post into each conversation as a message.
    static func sharePost(_ id: String, _ body: ShareRequest) async throws { try await call("POST", "/posts/\(escape(id))/share", body: body) }
    static func postLikes(_ id: String) async throws -> LikesResponse { try await get("/posts/\(escape(id))/likes") }

    // MARK: - Comments

    /// Top-level comments with their replies (pinned first, then mine, then oldest first).
    static func comments(postId: String) async throws -> [Comment] { try await getList("/posts/\(escape(postId))/comments") }
    static func addComment(postId: String, _ body: CreateCommentRequest) async throws -> Comment { try await send("POST", "/posts/\(escape(postId))/comments", body: body) }
    static func likeComment(_ id: String) async throws -> CommentLikeResponse { try await send("POST", "/comments/\(escape(id))/like") }
    static func unlikeComment(_ id: String) async throws -> CommentLikeResponse { try await send("DELETE", "/comments/\(escape(id))/like") }
    /// Toggles the pin (only on my posts).
    static func pinComment(_ id: String) async throws -> PinResponse { try await send("POST", "/comments/\(escape(id))/pin") }
    static func deleteComment(_ id: String) async throws { try await call("DELETE", "/comments/\(escape(id))") }

    // MARK: - Stories

    /// My tray first (if I have stories), then unseen trays, then seen trays.
    static func stories() async throws -> [StoryTray] { try await getList("/stories") }
    /// Throws a 404 APIError when the user has no active stories.
    static func userStories(_ username: String) async throws -> StoryTray { try await get("/stories/user/\(escape(username))") }
    static func highlight(_ id: String) async throws -> [Story] { try await getList("/highlights/\(escape(id))") }
    static func createStory(_ body: CreateStoryRequest) async throws -> Story { try await send("POST", "/stories", body: body) }
    static func markStorySeen(_ id: String) async throws { try await call("POST", "/stories/\(escape(id))/seen") }
    /// Mine only.
    static func storyViewers(_ id: String) async throws -> ViewersResponse { try await get("/stories/\(escape(id))/viewers") }
    /// Sends a DM to the story's author; returns that conversation.
    static func replyToStory(_ id: String, text: String) async throws -> StoryReplyResponse { try await send("POST", "/stories/\(escape(id))/reply", body: StoryReplyRequest(text: text)) }
    static func reactToStory(_ id: String, emoji: String) async throws { try await call("POST", "/stories/\(escape(id))/react", body: StoryReactRequest(emoji: emoji)) }
    static func deleteStory(_ id: String) async throws { try await call("DELETE", "/stories/\(escape(id))") }

    // MARK: - Accounts and search

    /// For my own username this returns my profile with isMe = true.
    static func profile(_ username: String) async throws -> Profile { try await get("/accounts/\(escape(username))") }
    static func accountPosts(_ username: String, tab: ProfileTab = .posts, cursor: String? = nil) async throws -> Page<Post> {
        try await get("/accounts/\(escape(username))/posts", query: ["tab": tab.rawValue, "cursor": cursor])
    }
    static func followers(_ username: String, cursor: String? = nil, query: String? = nil) async throws -> FollowListResponse {
        try await get("/accounts/\(escape(username))/followers", query: ["cursor": cursor, "q": query])
    }
    static func following(_ username: String, cursor: String? = nil, query: String? = nil) async throws -> FollowListResponse {
        try await get("/accounts/\(escape(username))/following", query: ["cursor": cursor, "q": query])
    }
    /// Takes the account id (not the username). Returns the updated account.
    static func follow(_ accountId: String) async throws -> Account { try await send("POST", "/accounts/\(escape(accountId))/follow") }
    static func unfollow(_ accountId: String) async throws -> Account { try await send("DELETE", "/accounts/\(escape(accountId))/follow") }
    /// Up to 8 people I don't follow yet.
    static func suggestions() async throws -> [Account] { try await getList("/suggestions") }
    static func search(_ query: String) async throws -> SearchResult { try await get("/search", query: ["q": query]) }

    // MARK: - Notifications

    static func notifications(cursor: String? = nil) async throws -> Page<AuraNotification> { try await get("/notifications", query: ["cursor": cursor]) }
    /// Marks every notification read and returns the new badges.
    static func markNotificationsRead() async throws -> Badges { try await send("POST", "/notifications/read") }

    // MARK: - Messages

    static func conversations() async throws -> ConversationsResponse { try await get("/conversations") }
    /// One member id = DM (reuses an existing one); two or more = a new group.
    static func createConversation(_ body: CreateConversationRequest) async throws -> Conversation { try await send("POST", "/conversations", body: body) }
    static func conversation(_ id: String) async throws -> Conversation { try await get("/conversations/\(escape(id))") }
    static func updateConversation(_ id: String, _ body: UpdateConversationRequest) async throws -> Conversation { try await send("PATCH", "/conversations/\(escape(id))", body: body) }
    /// Accepts a message request.
    static func acceptConversation(_ id: String) async throws -> Conversation { try await send("POST", "/conversations/\(escape(id))/accept") }
    static func deleteConversation(_ id: String) async throws { try await call("DELETE", "/conversations/\(escape(id))") }
    /// 40 per page, oldest to newest; `nextCursor` loads older messages.
    static func messages(conversationId: String, cursor: String? = nil) async throws -> Page<Message> {
        try await get("/conversations/\(escape(conversationId))/messages", query: ["cursor": cursor])
    }
    static func sendMessage(conversationId: String, _ body: SendMessageRequest) async throws -> Message {
        try await send("POST", "/conversations/\(escape(conversationId))/messages", body: body)
    }
    /// Sets unread to 0 and returns the new badges.
    static func markConversationRead(_ id: String) async throws -> Badges { try await send("POST", "/conversations/\(escape(id))/read") }
    /// `emoji: nil` removes my reaction. Returns the message's reactions.
    static func reactToMessage(_ id: String, emoji: String?) async throws -> [Reaction] {
        try await sendList("POST", "/messages/\(escape(id))/react", body: ReactRequest(emoji: emoji))
    }

    // MARK: - Plumbing

    /// API data is live, so never answer from a cache.
    private static let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.urlCache = nil
        config.timeoutIntervalForRequest = 30
        return URLSession(configuration: config)
    }()

    private struct ErrorBody: Decodable { var error: String }

    /// Makes an id, username or tag safe to put in a URL path.
    private static func escape(_ part: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return part.addingPercentEncoding(withAllowedCharacters: allowed) ?? part
    }

    private static func makeURL(_ path: String, query: [String: String?] = [:]) throws -> URL {
        guard var components = URLComponents(string: server + "/api" + path) else {
            throw APIError(message: "The server address \(server) doesn't look right.")
        }
        let items = query.compactMap { name, value in value.map { URLQueryItem(name: name, value: $0) } }
        if !items.isEmpty {
            components.queryItems = items.sorted { $0.name < $1.name }
            // URLComponents leaves "+" alone, but the server would read it as a space.
            components.percentEncodedQuery = components.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
        }
        guard let url = components.url else {
            throw APIError(message: "The server address \(server) doesn't look right.")
        }
        return url
    }

    private static func get<T: Decodable>(_ path: String, query: [String: String?] = [:]) async throws -> T {
        try await send("GET", path, query: query)
    }

    /// GET a JSON array, skipping any items that fail to decode.
    private static func getList<T: Decodable>(_ path: String) async throws -> [T] {
        let list: LossyList<T> = try await send("GET", path)
        return list.items
    }

    private static func sendList<T: Decodable>(_ method: String, _ path: String, body: (any Encodable)? = nil) async throws -> [T] {
        let list: LossyList<T> = try await send(method, path, body: body)
        return list.items
    }

    private static func send<T: Decodable>(_ method: String, _ path: String, query: [String: String?] = [:],
                                           body: (any Encodable)? = nil) async throws -> T {
        let data = try await perform(method, path, query: query, body: body)
        return try decode(T.self, from: data, path: path)
    }

    /// For endpoints whose answer we don't need (they reply { ok: true }).
    private static func call(_ method: String, _ path: String, body: (any Encodable)? = nil) async throws {
        _ = try await perform(method, path, query: [:], body: body)
    }

    private static func perform(_ method: String, _ path: String, query: [String: String?], body: (any Encodable)?) async throws -> Data {
        var request = URLRequest(url: try makeURL(path, query: query))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = try JSONEncoder().encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return try await transfer { try await session.data(for: request) }
    }

    private static func uploadRequest(contentType: String, width: Int?, height: Int?) throws -> URLRequest {
        var request = URLRequest(url: try makeURL("/upload"))
        request.httpMethod = "POST"
        request.timeoutInterval = 300 // videos can be big
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let width { request.setValue(String(width), forHTTPHeaderField: "X-Width") }
        if let height { request.setValue(String(height), forHTTPHeaderField: "X-Height") }
        return request
    }

    /// Runs a request and turns failures into readable APIErrors (using the server's { error } text when there is one).
    private static func transfer(_ work: () async throws -> (Data, URLResponse)) async throws -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await work()
        } catch {
            if error.isCancellation { throw CancellationError() }
            throw APIError(message: "No connection to \(server). Is the Aura server running?")
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let serverMessage = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error
            throw APIError(message: serverMessage ?? "Something went wrong (error \(status)).", status: status)
        }
        return data
    }

    private static func decode<T: Decodable>(_ type: T.Type, from data: Data, path: String) throws -> T {
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            #if DEBUG
            print("[API] Couldn't decode \(T.self) from \(path): \(error)")
            #endif
            throw APIError(message: "Aura sent something this app doesn't understand.")
        }
    }
}
