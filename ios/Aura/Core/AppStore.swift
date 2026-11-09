import Observation
import SwiftUI

/// Where the app is: asking the server, signing in, onboarding, using the app, or unable to reach the server.
enum AppPhase: Equatable {
    case loading
    /// The server has sign-in on and nobody is signed in on this iPhone (AppStore+Auth.swift).
    case signIn
    case onboarding
    case ready
    case unreachable(String)
}

/// The five tabs at the bottom.
enum AppTab: Hashable {
    case home, explore, create, reels, profile
}

/// What the full-screen story viewer should show.
struct StoryViewerRequest: Identifiable {
    let id = UUID()
    let trays: [StoryTray]
    let startIndex: Int
}

/// A post id wrapped so it can drive `.sheet(item:)` (the comments sheet).
struct PostSheetItem: Identifiable, Hashable {
    let id: String
}

/// A short message at the bottom of the screen, e.g. "Your post is live ✨".
struct Toast: Identifiable, Equatable {
    let id = UUID()
    let text: String
}

/// The app's shared state. One instance lives for the whole app and every screen reads it with
/// `@Environment(AppStore.self) private var store`.
///
/// It holds what more than one screen needs (who I am, badges, the post cache, stories, notifications,
/// conversations) and keeps it current with the live event stream. The methods are split by topic:
/// AppStore+Auth (signing in and out), +Posts, +Stories, +Messages, +Live (event handling) and +Navigation.
@Observable
@MainActor
final class AppStore {
    // MARK: - Session

    var phase: AppPhase = .loading
    /// True when the server has sign-in on (each Google account has its own world). False = local mode.
    var authEnabled = false
    /// The Google account signed in on this iPhone (nil when signed out, and always in local mode).
    var account: SignedInAccount?
    /// A note for the sign-in screen, e.g. why the app just signed out.
    var signInMessage: String?
    /// The human using the app. Set once onboarded.
    var me: Me?
    var settings: AuraSettings?
    var badges = Badges()
    /// True while the live event stream is connected.
    var isLive = false

    // MARK: - Posts and comments

    /// Every post the app has loaded, by id. Lists keep ids and read posts from here, so a like or a
    /// live `post.stats` update shows on every screen at once. A deleted post is removed (nil).
    var posts: [String: Post] = [:]
    /// Posts that went live since the feed loaded (newest first), including my own new posts.
    /// HomeView shows a "New posts" pill for them, then calls clearNewPosts() after refreshing.
    var newPostIds: [String] = []
    /// Comments by post id: top-level comments (oldest first) with their replies. Filled by loadComments(for:).
    var comments: [String: [Comment]] = [:]

    // MARK: - People

    /// The newest copy of an account we heard about after the screen loaded it (follow changes,
    /// story rings, "Active now"). Read through `latest(_:)`.
    var accountUpdates: [String: Account] = [:]

    // MARK: - Stories

    /// The stories row: my tray first, then unseen trays, then seen ones.
    var storyTrays: [StoryTray] = []

    // MARK: - Notifications

    var notifications: [AuraNotification] = []
    var notificationsCursor: String?
    var hasMoreNotifications = true

    // MARK: - Messages

    /// Inbox (Primary), newest activity first. Requests are separate.
    var conversations: [Conversation] = []
    var requests: [Conversation] = []
    /// Loaded messages by conversation id, oldest to newest.
    var messages: [String: [Message]] = [:]
    /// Cursor for loading older messages, by conversation id. No entry = no older messages.
    var olderMessagesCursor: [String: String] = [:]
    /// My messages that failed to send (ids of the local copies still shown in the chat).
    var failedMessageIds: Set<String> = []
    /// The chat on screen right now. ChatView sets it so banners skip that chat and it is marked read live.
    var activeConversationId: String?

    // MARK: - Overlays

    /// Banners waiting to slide in. BannerView shows the first one.
    var banners: [Banner] = []
    var milestone: Milestone?
    var toast: Toast?

    // MARK: - Navigation and presentation

    var selectedTab: AppTab = .home
    /// One navigation path per tab (see Routes.swift).
    var homePath: [Route] = []
    var explorePath: [Route] = []
    var createPath: [Route] = []
    var reelsPath: [Route] = []
    var profilePath: [Route] = []
    /// Goes up by one when Home is tapped again while the feed is showing: HomeView scrolls to the top.
    var homeScrollToTop = 0
    /// Non-nil = the full-screen story viewer is open.
    var storyViewer: StoryViewerRequest?
    /// Non-nil = the comments sheet is open for this post.
    var commentsSheet: PostSheetItem?
    /// Non-nil = the share sheet is open for this post.
    var shareSheetPost: Post?

    // MARK: - Internals

    let live = LiveStream()
    @ObservationIgnored var toastTask: Task<Void, Never>?
    @ObservationIgnored var wasDisconnected = false
    @ObservationIgnored private var signedOutObserver: NSObjectProtocol?

    init() {
        live.onEvent = { [weak self] event in self?.handle(event) }
        live.onConnectionChange = { [weak self] connected in self?.connectionChanged(connected) }
        // Any request answered 401 means this sign-in ended: back to the sign-in screen.
        signedOutObserver = NotificationCenter.default.addObserver(forName: API.signedOutNotification,
                                                                   object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.handleSignedOut() }
        }
    }

    // MARK: - Starting up

    /// The first thing the app does: ask the server who we are, then sign in, onboard or load the world.
    func start() async {
        do {
            let session = try await API.session()
            apply(session)
            if session.authEnabled && session.account == nil {
                // Nobody is signed in, or the saved sign-in stopped working: forget it and ask again.
                AuthToken.delete(for: API.server)
                phase = .signIn
            } else if session.onboarded {
                phase = .ready
                live.start()
                await loadInitialData()
            } else {
                phase = .onboarding
            }
        } catch {
            if error.isCancellation { return }
            phase = .unreachable(error.localizedDescription)
        }
    }

    /// Try the server again (from the "Can't reach Aura" screen).
    func retry() async {
        phase = .loading
        await start()
    }

    /// Point the app at a different server (Settings or the "Can't reach Aura" screen).
    /// Note: while the app was launched with `-AuraServer`, that launch argument wins.
    func changeServer(to address: String) async {
        UserDefaults.standard.set(address.trimmingCharacters(in: .whitespacesAndNewlines), forKey: API.serverKey)
        live.stop()
        Tracker.shared.discard() // what was seen belongs to the old server's world
        clearWorld()
        me = nil
        await retry()
    }

    /// Onboarding's last step built the world (POST /api/onboarding answered with this session): open the app.
    func finishOnboarding(with session: Session) async {
        clearWorld()
        apply(session)
        phase = .ready
        live.start()
        await loadInitialData()
    }

    /// Re-reads me, settings and badges.
    func refreshSession() async {
        if let session = try? await API.session() { apply(session) }
    }

    func refreshBadges() async {
        if let fresh = try? await API.badges() { badges = fresh }
    }

    /// Loads what the shared screens need right away (stories row, inbox, activity).
    func loadInitialData() async {
        async let stories: Void = loadStories()
        async let inbox: Void = loadConversations()
        async let activity: Void = loadNotifications()
        _ = await (stories, inbox, activity)
    }

    func apply(_ session: Session) {
        authEnabled = session.authEnabled
        account = session.account
        me = session.me
        settings = session.settings
        badges = session.badges
    }

    // MARK: - App lifecycle

    /// The app came to the front: reconnect the live stream and refresh the badges.
    func appDidBecomeActive() {
        guard phase == .ready else { return }
        live.start()
        Task { await refreshBadges() }
    }

    /// The app went to the background: close the stream so the world rests while nobody is looking,
    /// and send what was looked at so far.
    func appDidEnterBackground() {
        live.stop()
        Tracker.shared.sendBeforeSuspending()
    }

    // MARK: - Me and settings

    func updateMe(_ request: UpdateMeRequest) async throws {
        me = try await API.updateMe(request)
    }

    func updateSettings(_ request: UpdateSettingsRequest) async throws {
        settings = try await API.updateSettings(request)
        // A new tier changes my follower count, so re-read me too.
        if request.tier != nil { await refreshSession() }
    }

    /// Settings > Start over: wipes the world and returns to onboarding.
    func resetWorld() async throws {
        try await API.reset()
        handleReset()
    }

    /// Back to onboarding with everything cleared (after a reset, from here or another device).
    func handleReset() {
        live.stop()
        Tracker.shared.discard() // those posts are gone
        clearWorld()
        me = nil
        badges = Badges()
        phase = .onboarding
    }

    /// Forgets every cached thing and closes every screen.
    func clearWorld() {
        posts = [:]
        newPostIds = []
        comments = [:]
        accountUpdates = [:]
        storyTrays = []
        notifications = []
        notificationsCursor = nil
        hasMoreNotifications = true
        conversations = []
        requests = []
        messages = [:]
        olderMessagesCursor = [:]
        failedMessageIds = []
        activeConversationId = nil
        banners = []
        milestone = nil
        toast = nil
        selectedTab = .home
        homePath = []
        explorePath = []
        createPath = []
        reelsPath = []
        profilePath = []
        storyViewer = nil
        commentsSheet = nil
        shareSheetPost = nil
    }

    // MARK: - People

    /// The freshest version of an account (use it to show follow state and story rings).
    func latest(_ account: Account) -> Account {
        accountUpdates[account.id] ?? account
    }

    func isFollowing(_ account: Account) -> Bool {
        latest(account).iFollow
    }

    /// Follow (does nothing if I already follow them). For "Follow back" buttons and the like.
    func follow(_ account: Account) {
        if !isFollowing(account) { toggleFollow(account) }
    }

    /// Unfollow (does nothing if I don't follow them).
    func unfollow(_ account: Account) {
        if isFollowing(account) { toggleFollow(account) }
    }

    /// Follow or unfollow right away; undone if the server says no.
    func toggleFollow(_ account: Account) {
        let before = latest(account)
        var after = before
        after.iFollow.toggle()
        accountUpdates[account.id] = after
        Haptics.selection()
        Task {
            do {
                let fresh = after.iFollow ? try await API.follow(account.id) : try await API.unfollow(account.id)
                accountUpdates[account.id] = fresh
            } catch {
                accountUpdates[account.id] = before
                showToast(error.localizedDescription)
            }
        }
    }

    // MARK: - Notifications

    /// Loads the first page of activity (pull to refresh calls this too).
    func loadNotifications() async {
        guard let page = try? await API.notifications() else { return }
        notifications = page.items
        notificationsCursor = page.nextCursor
        hasMoreNotifications = page.nextCursor != nil
    }

    func loadMoreNotifications() async {
        guard hasMoreNotifications, let cursor = notificationsCursor,
              let page = try? await API.notifications(cursor: cursor) else { return }
        let known = Set(notifications.map(\.id))
        notifications += page.items.filter { !known.contains($0.id) }
        notificationsCursor = page.nextCursor
        hasMoreNotifications = page.nextCursor != nil
    }

    /// ActivityView calls this when it opens.
    func markNotificationsRead() async {
        guard notifications.contains(where: { !$0.read }) || badges.notifications > 0 else { return }
        for index in notifications.indices { notifications[index].read = true }
        badges.notifications = 0
        if let fresh = try? await API.markNotificationsRead() { badges = fresh }
    }

    // MARK: - Overlays

    /// Shows a short message at the bottom for a couple of seconds.
    func showToast(_ text: String) {
        toast = Toast(text: text)
        toastTask?.cancel()
        toastTask = Task {
            try? await Task.sleep(for: .seconds(2.6))
            if !Task.isCancelled { toast = nil }
        }
    }

    /// The banner on screen now (BannerView reads it).
    var currentBanner: Banner? { banners.first }

    func showBanner(_ banner: Banner) {
        // No banner for the chat you're already looking at.
        if let id = activeConversationId, banner.href == "/messages/\(id)" { return }
        // Keep the queue short when the world gets busy: drop the oldest waiting one, never the visible one.
        if banners.count >= 4 { banners.remove(at: 1) }
        banners.append(banner)
    }

    func dismissBanner(_ banner: Banner) {
        banners.removeAll { $0.id == banner.id }
    }

    func dismissMilestone() {
        milestone = nil
    }
}
