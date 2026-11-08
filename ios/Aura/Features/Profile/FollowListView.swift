import SwiftUI

/// Which list FollowListView shows.
enum FollowListMode: Hashable {
    case followers, following
}

/// Someone's followers or the people they follow, with a switch between the two, a search box and
/// Follow buttons. Loads more as you scroll.
struct FollowListView: View {
    @Environment(AppStore.self) private var store
    let username: String
    let mode: FollowListMode

    @State private var selected: FollowListMode
    @State private var query = ""
    @State private var accounts: [Account] = []
    @State private var cursor: String?
    @State private var hasLoaded = false
    @State private var isLoadingMore = false
    @State private var errorMessage: String?
    /// Their profile, for the counts on the two tabs (mine comes from the store, live).
    @State private var profile: Profile?

    init(username: String, mode: FollowListMode) {
        self.username = username
        self.mode = mode
        _selected = State(initialValue: mode)
    }

    private var isMe: Bool { username == store.me?.username }
    private var trimmedQuery: String { query.trimmingCharacters(in: .whitespaces) }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                list
            }
            .padding(.vertical, 6)
        }
        .scrollDismissesKeyboard(.immediately)
        .safeAreaInset(edge: .top, spacing: 0) { modeSwitch }
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search")
        .navigationTitle(username)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: "\(selected)|\(trimmedQuery)") { await load() }
        .task { if !isMe { profile = try? await API.profile(username) } }
    }

    // MARK: - Pieces

    @ViewBuilder private var list: some View {
        if !hasLoaded {
            if let errorMessage {
                EmptyStateView(systemImage: "wifi.slash", title: "Couldn't load this list", message: errorMessage,
                               actionTitle: "Try again") { Task { await load() } }
            } else {
                ProgressView().padding(.top, 40)
            }
        } else if accounts.isEmpty {
            EmptyStateView(systemImage: "person.2", title: emptyTitle, message: emptyMessage)
                .padding(.top, 20)
        } else {
            ForEach(accounts) { account in
                UserRow(account: account)
                    .onAppear {
                        if account.id == accounts.last?.id { Task { await loadMore() } }
                    }
            }
            if isLoadingMore {
                ProgressView().padding(16)
            }
        }
    }

    /// "1,204 followers | 312 following" with an underline under the chosen one.
    private var modeSwitch: some View {
        HStack(spacing: 0) {
            modeButton(.followers, title: countTitle(followerCount, "follower"))
            modeButton(.following, title: countTitle(followingCount, "following", plural: "following"))
        }
        .background(Theme.background)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.border).frame(height: 0.5) }
    }

    private func modeButton(_ value: FollowListMode, title: String) -> some View {
        let isSelected = selected == value
        return Button {
            guard !isSelected else { return }
            Haptics.selection()
            selected = value
            accounts = []
            hasLoaded = false
        } label: {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(isSelected ? Theme.text : Theme.muted)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(isSelected ? Theme.text : .clear).frame(height: 1.5)
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var followerCount: Int? { isMe ? store.me?.followers : profile?.followers }
    private var followingCount: Int? { isMe ? store.me?.following : profile?.following }

    private func countTitle(_ count: Int?, _ singular: String, plural: String? = nil) -> String {
        guard let count else { return plural ?? singular + "s" }
        return Format.count(count, singular, plural)
    }

    private var emptyTitle: String {
        if !trimmedQuery.isEmpty { return "No results" }
        return selected == .followers ? "No followers yet" : "Not following anyone yet"
    }

    private var emptyMessage: String? {
        trimmedQuery.isEmpty ? nil : "No one here matches “\(trimmedQuery)”."
    }

    // MARK: - Loading

    private func fetch(cursor: String?) async throws -> FollowListResponse {
        let search = trimmedQuery.isEmpty ? nil : trimmedQuery
        return selected == .followers
            ? try await API.followers(username, cursor: cursor, query: search)
            : try await API.following(username, cursor: cursor, query: search)
    }

    /// The first page. While typing it waits for a short pause first (typing again cancels it).
    private func load() async {
        if !trimmedQuery.isEmpty {
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
        }
        do {
            let response = try await fetch(cursor: nil)
            accounts = response.accounts
            cursor = response.nextCursor
            hasLoaded = true
            errorMessage = nil
        } catch {
            if !error.isCancellation { errorMessage = error.localizedDescription }
        }
    }

    private func loadMore() async {
        guard hasLoaded, !isLoadingMore, let cursor else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        guard let response = try? await fetch(cursor: cursor) else { return }
        let known = Set(accounts.map(\.id))
        accounts += response.accounts.filter { !known.contains($0.id) }
        self.cursor = response.nextCursor
    }
}
