import Foundation

/// Someone or a hashtag opened from search, remembered for the "Recent" list.
struct RecentSearch: Codable, Hashable, Identifiable {
    var account: Account?
    var tag: String?

    var id: String { account.map { "@" + $0.id } ?? "#" + (tag ?? "") }
}

/// The last few things opened from search, saved on this device (UserDefaults), newest first.
enum RecentSearches {
    private static let key = "recentSearches"
    private static let limit = 12

    static func load() -> [RecentSearch] {
        guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([RecentSearch].self, from: data)) ?? []
    }

    /// Puts an item at the top (moving it there if it was already in the list) and returns the new list.
    @discardableResult
    static func add(_ item: RecentSearch) -> [RecentSearch] {
        var list = load().filter { $0.id != item.id }
        list.insert(item, at: 0)
        save(Array(list.prefix(limit)))
        return load()
    }

    @discardableResult
    static func remove(_ item: RecentSearch) -> [RecentSearch] {
        save(load().filter { $0.id != item.id })
        return load()
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }

    private static func save(_ list: [RecentSearch]) {
        if let data = try? JSONEncoder().encode(list) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}
