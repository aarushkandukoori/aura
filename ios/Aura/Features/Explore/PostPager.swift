import Observation
import SwiftUI

/// Loads a list of posts one page at a time: Explore, hashtag pages, Saved and the profile grids.
///
/// It keeps only post ids. The posts themselves go into the store's cache (`store.remember`), and the
/// screen shows `store.posts[id]`, so a like or a live count update appears on every screen at once.
///
///     @State private var pager = PostPager { cursor in try await API.saved(cursor: cursor) }
///     ...
///     PostGrid(posts: pager.posts(in: store), onLastAppear: { Task { await pager.loadMore(into: store) } })
///     .task { await pager.loadFirstPage(into: store) }
@Observable
@MainActor
final class PostPager {
    private(set) var ids: [String] = []
    private(set) var isLoading = false
    /// True once the first page has arrived (so "no posts" can be told apart from "still loading").
    private(set) var hasLoaded = false
    private(set) var errorMessage: String?
    private var cursor: String?
    private var hasMore = true
    private let fetch: (String?) async throws -> Page<Post>

    /// `fetch` gets the cursor of the page to load (nil = the first page).
    init(fetch: @escaping (String?) async throws -> Page<Post>) {
        self.fetch = fetch
    }

    /// The loaded posts, freshest copies from the cache. Deleted posts drop out by themselves.
    func posts(in store: AppStore) -> [Post] {
        ids.compactMap { store.posts[$0] }
    }

    /// Loads the first page only if nothing is loaded yet (for `.task`, which runs on every appear).
    func loadFirstPage(into store: AppStore) async {
        guard !hasLoaded else { return }
        await reload(into: store)
    }

    /// Starts over from the first page (pull to refresh, a new topic).
    func reload(into store: AppStore) async {
        isLoading = true
        defer { isLoading = false }
        do {
            let page = try await fetch(nil)
            store.remember(page.items)
            ids = unique(page.items.map(\.id))
            cursor = page.nextCursor
            hasMore = page.nextCursor != nil
            errorMessage = nil
            hasLoaded = true
        } catch {
            if !error.isCancellation { errorMessage = error.localizedDescription }
        }
    }

    /// Loads the next page, if there is one and nothing is loading already.
    func loadMore(into store: AppStore) async {
        guard hasLoaded, hasMore, !isLoading, let cursor else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let page = try await fetch(cursor)
            store.remember(page.items)
            ids = unique(ids + page.items.map(\.id))
            self.cursor = page.nextCursor
            hasMore = page.nextCursor != nil
        } catch {
            // A failed next page isn't worth an error screen; scrolling to the end again retries.
        }
    }

    /// Drops repeats (a post can show up again when new posts shift the pages), keeping the first.
    private func unique(_ list: [String]) -> [String] {
        var seen = Set<String>()
        return list.filter { seen.insert($0).inserted }
    }
}
