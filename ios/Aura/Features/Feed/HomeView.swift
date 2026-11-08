import SwiftUI

/// The Home tab: the stories row, then the feed (endless scrolling, pull to refresh), with a
/// "New posts" pill when people you follow post and "You're all caught up" where their posts end.
///
/// The top bar (wordmark, activity, messages) comes from MainTabView, so there's no navigation bar here.
struct HomeView: View {
    @Environment(AppStore.self) private var store
    @State private var feed = FeedModel()

    /// The id at the very top of the list, for scrolling back up.
    private let topID = "feed-top"

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 0) {
                    StoriesTrayView()
                        .id(topID)
                    Rectangle().fill(Theme.border).frame(height: 0.5)
                    feedContent
                }
            }
            .refreshable { await refresh() }
            .overlay(alignment: .top) { newPostsPill(proxy) }
            .animation(.spring(duration: 0.4), value: newPosts.map(\.id))
            .task { if !feed.hasLoaded { await feed.loadFirstPage(store) } }
            .onChange(of: store.newPostIds) { showMyNewPosts(proxy) }
            .onChange(of: store.homeScrollToTop) {
                withAnimation(.snappy) { proxy.scrollTo(topID, anchor: .top) }
            }
        }
    }

    // MARK: - The list

    @ViewBuilder private var feedContent: some View {
        if !feed.hasLoaded {
            if let errorMessage = feed.errorMessage {
                EmptyStateView(systemImage: "wifi.slash", title: "Couldn't load your feed", message: errorMessage,
                               actionTitle: "Try again") { Task { await feed.loadFirstPage(store) } }
                    .padding(.top, 40)
            } else {
                FeedSkeleton()
            }
        } else if feed.ids.isEmpty {
            EmptyStateView(systemImage: "sparkles", title: "Your feed is warming up",
                           message: "Posts from people you follow will show up here.")
                .padding(.top, 40)
        } else {
            posts
            footer
        }
    }

    private var posts: some View {
        let caughtUp = feed.caughtUpIndex
        return ForEach(Array(feed.ids.enumerated()), id: \.element) { index, id in
            if index == caughtUp {
                CaughtUpView(showsSuggestedHeader: true)
            }
            // A nil post was deleted: show nothing.
            if let post = store.posts[id] {
                if feed.suggestedIds.contains(id) {
                    SuggestedLabel()
                }
                PostCellView(post: post)
                    .onAppear { loadMoreIfNeeded(after: index) }
            }
        }
    }

    @ViewBuilder private var footer: some View {
        if feed.isLoadingMore {
            ProgressView()
                .padding(.vertical, 28)
        } else if feed.loadMoreFailed {
            Button("Couldn't load more. Try again") {
                Task { await feed.loadMore(store) }
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Theme.accent)
            .padding(.vertical, 28)
        } else if feed.caughtUpIndex == feed.ids.count {
            CaughtUpView(showsSuggestedHeader: false)
                .padding(.bottom, 20)
        } else if !feed.hasMore {
            Color.clear.frame(height: 40)
        }
    }

    // MARK: - New posts

    /// Posts that went live since the feed loaded, from people I follow (my own go straight to the top).
    private var newPosts: [Post] {
        store.newPostIds
            .filter { !feed.ids.contains($0) }
            .compactMap { store.posts[$0] }
            .filter { !$0.author.isMe && store.latest($0.author).iFollow }
    }

    @ViewBuilder private func newPostsPill(_ proxy: ScrollViewProxy) -> some View {
        let fresh = newPosts
        if !fresh.isEmpty {
            NewPostsPill(authors: fresh.map(\.author)) {
                feed.insertAtTop(fresh.map(\.id))
                store.clearNewPosts()
                Haptics.tap()
                withAnimation(.snappy) { proxy.scrollTo(topID, anchor: .top) }
            }
            .padding(.top, 10)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }

    /// My own new post goes straight to the top of the feed (and the feed scrolls up to it).
    private func showMyNewPosts(_ proxy: ScrollViewProxy) {
        let mine = store.newPostIds.filter { id in
            !feed.ids.contains(id) && store.posts[id]?.author.isMe == true
        }
        guard !mine.isEmpty else { return }
        withAnimation(.snappy) {
            feed.insertAtTop(mine)
            proxy.scrollTo(topID, anchor: .top)
        }
    }

    // MARK: - Loading

    /// Starts on the next page when one of the last three posts appears.
    private func loadMoreIfNeeded(after index: Int) {
        guard index >= feed.ids.count - 3, feed.hasMore, !feed.loadMoreFailed else { return }
        Task { await feed.loadMore(store) }
    }

    private func refresh() async {
        async let stories: Void = store.loadStories()
        await feed.loadFirstPage(store)
        store.clearNewPosts()
        await stories
    }
}
