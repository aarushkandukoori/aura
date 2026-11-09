import SwiftUI

/// A profile page: mine or anyone else's.
///
/// Mine reads `store.me`, so my follower count, post count and aura change live. Anyone else's
/// profile is loaded from the server, and their follower count follows my Follow button right away.
struct ProfileView: View {
    let username: String

    var body: some View {
        // A new username (after I rename myself) starts a fresh screen with fresh state.
        ProfileScreen(username: username)
            .id(username)
    }
}

/// The grids under a profile.
enum ProfileGridTab: String, CaseIterable, Identifiable {
    case posts, reels, tagged, saved

    var id: String { rawValue }

    var title: String {
        switch self {
        case .posts: "Posts"
        case .reels: "Reels"
        case .tagged: "Tagged"
        case .saved: "Saved"
        }
    }

    func icon(selected: Bool) -> String {
        let name = switch self {
        case .posts: "square.grid.3x3"
        case .reels: "play.rectangle"
        case .tagged: "person.crop.square"
        case .saved: "bookmark"
        }
        return selected ? name + ".fill" : name
    }

    /// Reels are tall, everything else uses the usual 3:4 tiles.
    var tileAspect: CGFloat { self == .reels ? 9.0 / 16.0 : 3.0 / 4.0 }
}

private struct ProfileScreen: View {
    @Environment(AppStore.self) private var store
    let username: String

    @State private var loadedProfile: Profile?
    @State private var errorMessage: String?
    @State private var notFound = false
    @State private var tab: ProfileGridTab = .posts
    /// One pager per grid, so switching tabs back and forth doesn't reload.
    @State private var pagers: [ProfileGridTab: PostPager]

    init(username: String) {
        self.username = username
        _pagers = State(initialValue: [
            .posts: PostPager { cursor in try await API.accountPosts(username, tab: .posts, cursor: cursor) },
            .reels: PostPager { cursor in try await API.accountPosts(username, tab: .reels, cursor: cursor) },
            .tagged: PostPager { cursor in try await API.accountPosts(username, tab: .tagged, cursor: cursor) },
            .saved: PostPager { cursor in try await API.saved(cursor: cursor) },
        ])
    }

    private var isMe: Bool { username == store.me?.username }

    private var profile: Profile? { isMe ? store.me?.profile : loadedProfile }

    private var tabs: [ProfileGridTab] { isMe ? ProfileGridTab.allCases : [.posts, .reels, .tagged] }

    var body: some View {
        content
            .navigationTitle(username)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbar }
            .task { await loadProfile() }
            .onChange(of: store.me?.postCount) {
                // I posted or deleted something: refresh my grids so it shows up right away.
                guard isMe else { return }
                Task {
                    await pagers[.posts]?.reload(into: store)
                    await pagers[.reels]?.reload(into: store)
                }
            }
    }

    @ViewBuilder private var content: some View {
        if let profile {
            ScrollView {
                LazyVStack(spacing: 0, pinnedViews: [.sectionHeaders]) {
                    ProfileHeader(profile: profile, isMe: isMe, aura: isMe ? store.me?.aura : nil)
                    if !profile.highlights.isEmpty {
                        HighlightsRow(highlights: profile.highlights, owner: profile.account)
                    }
                    Section {
                        grid
                    } header: {
                        ProfileTabBar(tabs: tabs, selection: $tab)
                    }
                }
            }
            .refreshable { await refresh() }
            .task(id: tab) {
                // Saved changes from other screens, so it reloads every time; the rest load once.
                if tab == .saved {
                    await pagers[.saved]?.reload(into: store)
                } else {
                    await pagers[tab]?.loadFirstPage(into: store)
                }
            }
        } else if notFound {
            EmptyStateView(systemImage: "person.crop.circle.badge.questionmark", title: "Account not found",
                           message: "There's no one called @\(username).")
        } else if let errorMessage {
            EmptyStateView(systemImage: "wifi.slash", title: "Couldn't load this profile", message: errorMessage,
                           actionTitle: "Try again") { Task { await loadProfile() } }
        } else {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    // MARK: - Grid

    @ViewBuilder private var grid: some View {
        if let pager = pagers[tab] {
            // Saved only shows posts that are still saved (unsaving elsewhere hides them at once).
            let posts = tab == .saved ? pager.posts(in: store).filter(\.savedByMe) : pager.posts(in: store)
            if !pager.hasLoaded {
                if let error = pager.errorMessage {
                    EmptyStateView(systemImage: "wifi.slash", title: "Couldn't load posts", message: error,
                                   actionTitle: "Try again") { Task { await pager.reload(into: store) } }
                } else {
                    GridSkeleton(rows: 3, tileAspect: tab.tileAspect)
                }
            } else if posts.isEmpty {
                emptyGrid
            } else {
                PostGrid(posts: posts, tileAspect: tab.tileAspect, showsViewCounts: tab == .reels,
                         onLastAppear: { Task { await pager.loadMore(into: store) } })
            }
        }
    }

    @ViewBuilder private var emptyGrid: some View {
        switch (tab, isMe) {
        case (.posts, true):
            EmptyStateView(systemImage: "camera", title: "Share your first photo",
                           message: "Everyone's waiting to see it.", actionTitle: "Create a post") {
                store.show([], in: .create)
            }
        case (.posts, false):
            EmptyStateView(systemImage: "camera", title: "No posts yet")
        case (.reels, true):
            EmptyStateView(systemImage: "play.rectangle", title: "Share a reel",
                           message: "Short videos show up here.", actionTitle: "Create a reel") {
                store.show([], in: .create)
            }
        case (.reels, false):
            EmptyStateView(systemImage: "play.rectangle", title: "No reels yet")
        case (.tagged, true):
            EmptyStateView(systemImage: "person.crop.square", title: "Photos of you",
                           message: "When people tag you in photos, they'll appear here.")
        case (.tagged, false):
            EmptyStateView(systemImage: "person.crop.square", title: "No photos yet",
                           message: "Photos @\(username) is tagged in show up here.")
        case (.saved, _):
            EmptyStateView(systemImage: "bookmark", title: "Save what you love",
                           message: "Tap the bookmark on any post to keep it here. Only you can see what you've saved.")
        }
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        if isMe {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: Route.settings) {
                    Image(systemName: "gearshape")
                }
                .tint(Theme.text)
                .accessibilityLabel("Settings")
            }
        } else if let profile {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    if let url = ProfileLinks.url(for: profile.username) {
                        ShareLink(item: url) { Label("Share this profile", systemImage: "square.and.arrow.up") }
                    }
                    Button {
                        UIPasteboard.general.string = "@" + profile.username
                        store.showToast("Username copied")
                    } label: {
                        Label("Copy username", systemImage: "doc.on.doc")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .tint(Theme.text)
                .accessibilityLabel("More")
            }
        }
    }

    // MARK: - Loading

    private func loadProfile() async {
        guard !isMe else { return }
        do {
            let profile = try await API.profile(username)
            // The first load is a visit (pull to refresh isn't), which teaches the algorithm.
            if loadedProfile == nil { Tracker.shared.profileView(profile.id) }
            loadedProfile = profile
            errorMessage = nil
            notFound = false
        } catch {
            if error.isCancellation { return }
            if (error as? APIError)?.status == 404 {
                notFound = true
            } else if loadedProfile == nil {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func refresh() async {
        if isMe {
            await store.refreshSession()
        } else {
            await loadProfile()
        }
        await pagers[tab]?.reload(into: store)
    }
}

/// Links to a profile on the web app that this Aura server serves.
enum ProfileLinks {
    static func url(for username: String) -> URL? {
        URL(string: "\(API.server)/\(username)")
    }
}
