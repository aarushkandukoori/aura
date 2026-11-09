import Observation

/// The home feed's list: which posts it shows, in order, and where the next page starts.
///
/// It only keeps post ids. The posts themselves live in the store's cache, so live likes and
/// comments show up in the feed without this list changing.
@Observable
@MainActor
final class FeedModel {
    private(set) var ids: [String] = []
    /// Posts the server marked "suggested". Kept here because another screen may reload the same
    /// post into the cache without the flag.
    private(set) var suggestedIds: Set<String> = []
    /// Why the algorithm suggested a post ("Because you like #coffee"), by post id.
    private(set) var reasons: [String: String] = [:]
    private(set) var nextCursor: String?
    private(set) var hasLoaded = false
    private(set) var isLoadingMore = false
    private(set) var loadMoreFailed = false
    /// Why the first page couldn't load (shown instead of the feed).
    private(set) var errorMessage: String?

    var hasMore: Bool { nextCursor != nil }

    /// Loads (or reloads) the newest page and starts the list over.
    func loadFirstPage(_ store: AppStore) async {
        do {
            let page = try await API.feed()
            store.remember(page.items)
            ids = []
            suggestedIds = []
            reasons = [:]
            add(page)
            hasLoaded = true
            errorMessage = nil
            loadMoreFailed = false
        } catch {
            if !error.isCancellation { errorMessage = error.localizedDescription }
        }
    }

    /// Adds the next page at the bottom (called as the user nears the end).
    func loadMore(_ store: AppStore) async {
        guard let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        loadMoreFailed = false
        do {
            let page = try await API.feed(cursor: cursor)
            store.remember(page.items)
            add(page)
        } catch {
            if !error.isCancellation { loadMoreFailed = true }
        }
        isLoadingMore = false
    }

    /// Puts posts at the very top (my new post, or the posts behind the "New posts" pill).
    func insertAtTop(_ newIds: [String]) {
        let fresh = newIds.filter { !ids.contains($0) }
        ids.insert(contentsOf: fresh, at: 0)
    }

    private func add(_ page: Page<Post>) {
        let known = Set(ids)
        ids += page.items.map(\.id).filter { !known.contains($0) }
        suggestedIds.formUnion(page.items.filter(\.suggested).map(\.id))
        for post in page.items where post.suggested {
            if let reason = post.reason?.trimmingCharacters(in: .whitespaces), !reason.isEmpty { reasons[post.id] = reason }
        }
        nextCursor = page.nextCursor
    }

    /// Where "You're all caught up" goes, or nil when we can't tell yet.
    ///
    /// The server slips one suggested post in after every six posts from people you follow. Once
    /// those run out, every post after them is suggested. So the marker goes before the run of
    /// suggested posts at the end of the list, as soon as that run is two posts long (two in a row
    /// never happens earlier) or the feed has nothing more to load.
    var caughtUpIndex: Int? {
        var start = ids.count
        while start > 0, suggestedIds.contains(ids[start - 1]) { start -= 1 }
        let trailingSuggested = ids.count - start
        if trailingSuggested >= 2 || !hasMore { return start }
        return nil
    }
}
