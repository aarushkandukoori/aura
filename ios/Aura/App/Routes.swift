import SwiftUI

/// Every screen that can be pushed onto a tab's navigation stack.
///
///     NavigationLink(value: Route.profile(post.author.username)) { ... }
///     store.navigate(to: .chat(conversation.id))      // from a button, sheet or banner
enum Route: Hashable {
    case profile(String)        // username
    case post(String)           // post id
    case likes(String)          // post id: who liked it
    case tag(String)            // hashtag without "#"
    case followers(String)      // username
    case following(String)      // username
    case chat(String)           // conversation id
    case newMessage
    case settings
    case editProfile
    case saved
    case activity
    case inbox
    case search
    case reel(String)           // post id: the reels player starting at this reel

    /// The screen for this route, on the Aura background (in dark mode the system's own background
    /// is pure black, a shade off from Theme.background). Screens can still paint their own background.
    @MainActor
    var destination: some View {
        screen
            // Each route is its own screen. When a banner swaps one chat for another at the same
            // spot in the path, the new chat starts fresh (loads its messages) instead of reusing
            // the old chat's screen and state.
            .id(self)
            .background(Theme.background.ignoresSafeArea())
    }

    /// This is the one place routes are turned into views.
    @MainActor @ViewBuilder
    private var screen: some View {
        switch self {
        case .profile(let username): ProfileView(username: username)
        case .post(let id): PostDetailView(postId: id)
        case .likes(let postId): LikesView(postId: postId)
        case .tag(let tag): TagView(tag: tag)
        case .followers(let username): FollowListView(username: username, mode: .followers)
        case .following(let username): FollowListView(username: username, mode: .following)
        case .chat(let id): ChatView(conversationId: id)
        case .newMessage: NewMessageView()
        case .settings: SettingsView()
        case .editProfile: EditProfileView()
        case .saved: SavedView()
        case .activity: ActivityView()
        case .inbox: InboxView()
        case .search: SearchView()
        case .reel(let id): ReelsView(startId: id)
        }
    }
}

extension View {
    /// Lets `NavigationLink(value: Route...)` work inside this NavigationStack. Every tab already
    /// has it; add it to the root of a NavigationStack you create yourself (for example in a sheet).
    func withAuraRoutes() -> some View {
        navigationDestination(for: Route.self) { route in
            route.destination
        }
    }
}
