import Foundation

/// Navigation: pushing screens, the comments/share sheets, and opening in-app links.
///
/// Inside a NavigationStack you can simply use `NavigationLink(value: Route.profile("maya"))`.
/// Use these methods from places without a link: buttons, sheets, banners, notifications.
extension AppStore {
    // MARK: - Pushing screens

    /// Pushes a screen onto the current tab (closing any sheet or story viewer first).
    func navigate(to route: Route) {
        dismissPresentations()
        setPath(path(for: selectedTab) + [route], for: selectedTab)
    }

    /// Switches tab and shows exactly these screens on it.
    func show(_ routes: [Route], in tab: AppTab) {
        dismissPresentations()
        selectedTab = tab
        setPath(routes, for: tab)
    }

    func path(for tab: AppTab) -> [Route] {
        switch tab {
        case .home: homePath
        case .explore: explorePath
        case .create: createPath
        case .reels: reelsPath
        case .profile: profilePath
        }
    }

    func setPath(_ path: [Route], for tab: AppTab) {
        switch tab {
        case .home: homePath = path
        case .explore: explorePath = path
        case .create: createPath = path
        case .reels: reelsPath = path
        case .profile: profilePath = path
        }
    }

    /// Back to the first screen of a tab (tapping the current tab again does this).
    func popToRoot(_ tab: AppTab) {
        setPath([], for: tab)
    }

    // MARK: - Sheets and the story viewer

    func showComments(postId: String) {
        commentsSheet = PostSheetItem(id: postId)
    }

    func showShareSheet(for post: Post) {
        shareSheetPost = post
    }

    /// Closes the comments sheet, the share sheet and the story viewer.
    func dismissPresentations() {
        commentsSheet = nil
        shareSheetPost = nil
        storyViewer = nil
    }

    // MARK: - Links

    /// Opens an in-app path, the same paths the web app uses (banners and notifications send these):
    /// "/messages/c_1", "/messages", "/activity", "/p/p_1", "/p/p_1/likes", "/reels/p_1",
    /// "/explore/tags/sunset", "/stories/maya.chen", "/settings", "/saved", "/maya.chen", "/maya.chen/followers".
    func open(href: String) {
        let parts = href.split(separator: "/").map { String($0).removingPercentEncoding ?? String($0) }
        guard let first = parts.first else {
            show([], in: .home)
            return
        }
        let second = parts.count > 1 ? parts[1] : nil
        switch first {
        case "messages":
            switch second {
            case nil: show([.inbox], in: .home)
            case "new"?: show([.inbox, .newMessage], in: .home)
            case let id?: show([.inbox, .chat(id)], in: .home)
            }
        case "activity":
            show([.activity], in: .home)
        case "p":
            guard let id = second else { return }
            navigate(to: parts.count > 2 && parts[2] == "likes" ? .likes(id) : .post(id))
        case "reels":
            if let id = second { navigate(to: .reel(id)) } else { show([], in: .reels) }
        case "explore":
            if second == "tags", parts.count > 2 { navigate(to: .tag(parts[2])) } else { show([], in: .explore) }
        case "search":
            navigate(to: .search)
        case "stories":
            if let username = second { Task { await openStories(username: username) } }
        case "settings":
            navigate(to: second == "profile" ? .editProfile : .settings)
        case "saved":
            navigate(to: .saved)
        case "create":
            show([], in: .create)
        default:
            let username = first
            switch second {
            case "followers"?: navigate(to: .followers(username))
            case "following"?: navigate(to: .following(username))
            default: navigate(to: .profile(username))
            }
        }
    }

    /// Opens an aura:// link (@mentions and #tags in text, deep links). Returns false for other links.
    ///
    ///     aura://profile/maya.chen  ·  aura://tag/sunset  ·  aura://<any in-app path>, e.g. aura://messages/c_1
    @discardableResult
    func open(url: URL) -> Bool {
        guard url.scheme == "aura" else { return false }
        let host = url.host(percentEncoded: false) ?? ""
        let rest = url.path(percentEncoded: false).split(separator: "/").map(String.init)
        switch host {
        case "profile":
            if let username = rest.first { navigate(to: .profile(username)) }
        case "tag":
            if let tag = rest.first { navigate(to: .tag(tag)) }
        default:
            open(href: "/" + ([host] + rest).joined(separator: "/"))
        }
        return true
    }
}
