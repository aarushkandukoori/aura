import SwiftUI

/// Opens stories the Instagram way. Tapping an avatar spins its ring while the first picture loads,
/// then the story viewer grows out of that avatar; closing shrinks it back into the avatar of
/// whoever's story was showing (StoryViewer draws the zoom).
///
///     let spot = StoryZoom.headerID(post.id)
///     AvatarView(account: author, size: 38, showsStoryRing: true, storyZoomID: spot) {
///         Task { await StoryZoom.shared.open(author, from: spot, store: store) }
///     }
///
/// Avatars with a `storyZoomID` report where they are on screen. The id names the spot, not just the
/// person, because the same face can be on screen twice (in the stories row and on a post).
@Observable
@MainActor
final class StoryZoom {
    static let shared = StoryZoom()

    /// The avatar whose ring is spinning while its story loads.
    private(set) var loadingID: String?
    /// Whose stories the open viewer is showing (the stories row keeps that face in view).
    var currentAuthorId: String?

    /// Where each story avatar is on screen, in window coordinates. Not observed: it changes on
    /// every scroll and is only read when the viewer opens or closes.
    @ObservationIgnored private var frames: [String: CGRect] = [:]
    /// The avatar the open viewer came out of, and whose avatar that is.
    @ObservationIgnored private var source: (id: String, authorId: String)?
    /// The avatar frame the viewer grows from, handed to the viewer once when it appears.
    @ObservationIgnored private var pendingOpenFrame: CGRect?

    /// Spin for at least this long, so a tap always gets a visible answer (even with the picture cached).
    private static let minimumSpin = 0.3
    /// Never keep someone waiting longer than this for the picture; the viewer can finish loading it.
    private static let maximumSpin = 1.5

    // MARK: - Ids for each place an avatar can be

    static func trayID(_ accountId: String) -> String { "tray-\(accountId)" }
    static func headerID(_ postId: String) -> String { "header-\(postId)" }
    static func profileID(_ accountId: String) -> String { "profile-\(accountId)" }
    static func reelID(_ postId: String) -> String { "reel-\(postId)" }
    static func highlightID(_ highlightId: String) -> String { "highlight-\(highlightId)" }

    // MARK: - Opening

    /// Plays `trays` from `index`, growing the viewer out of the avatar at `sourceID`.
    func open(_ trays: [StoryTray], at index: Int, from sourceID: String, store: AppStore) async {
        guard trays.indices.contains(index), loadingID == nil else { return }
        loadingID = sourceID
        let started = Date.now
        await preloadFirstPicture(of: trays[index])
        let spun = Date.now.timeIntervalSince(started)
        if spun < Self.minimumSpin { try? await Task.sleep(for: .seconds(Self.minimumSpin - spun)) }
        loadingID = nil
        present(trays, at: index, from: sourceID, store: store)
    }

    /// Plays someone's stories: from the stories row when they're in it, otherwise from the server.
    /// Returns false when they have no stories right now.
    @discardableResult
    func open(_ account: Account, from sourceID: String, store: AppStore) async -> Bool {
        if let index = store.storyTrays.firstIndex(where: { $0.author.id == account.id }) {
            await open(store.storyTrays, at: index, from: sourceID, store: store)
            return true
        }
        guard loadingID == nil else { return true }
        loadingID = sourceID // the ring spins while we ask the server too
        let tray = try? await API.userStories(account.username)
        loadingID = nil
        guard let tray, !tray.stories.isEmpty else { return false }
        await open([tray], at: 0, from: sourceID, store: store)
        return true
    }

    /// Plays one of a profile's highlights, growing out of its circle.
    func openHighlight(_ highlight: Highlight, of owner: Account, store: AppStore) async {
        let sourceID = Self.highlightID(highlight.id)
        guard loadingID == nil else { return }
        loadingID = sourceID // the circle's ring spins while the stories load
        do {
            let stories = try await API.highlight(highlight.id)
            loadingID = nil
            guard !stories.isEmpty else { return }
            let latest = stories.last?.createdAt ?? 0
            let tray = StoryTray(author: owner, stories: stories, allSeen: true, latestAt: latest)
            await open([tray], at: 0, from: sourceID, store: store)
        } catch {
            loadingID = nil
            if !error.isCancellation { store.showToast(error.localizedDescription) }
        }
    }

    /// The viewer calls this once, when it appears: the avatar frame to grow out of, if there is one.
    func takeOpenFrame() -> CGRect? {
        defer { pendingOpenFrame = nil }
        return pendingOpenFrame
    }

    // MARK: - Closing

    /// Where the viewer should shrink to when it closes on `authorId`'s stories: the avatar it came
    /// out of (if it's still that person) or their face in the stories row. nil = neither is on screen.
    func closeFrame(for authorId: String, in screen: CGRect) -> CGRect? {
        var ids = [Self.trayID(authorId)]
        if let source, source.authorId == authorId { ids.insert(source.id, at: 0) }
        let visibleArea = screen.insetBy(dx: 8, dy: 8)
        return ids.compactMap { frames[$0] }.first { visibleArea.contains(CGPoint(x: $0.midX, y: $0.midY)) }
    }

    /// The viewer has closed.
    func viewerClosed() {
        source = nil
        currentAuthorId = nil
    }

    // MARK: - Avatar frames

    func setFrame(_ frame: CGRect, for id: String) {
        frames[id] = frame
    }

    func removeFrame(for id: String) {
        frames[id] = nil
    }

    // MARK: - Helpers

    /// Shows the viewer. It draws its own zoom out of the avatar, so the cover appears without the
    /// usual slide up (without an avatar frame to grow from, it keeps the slide).
    private func present(_ trays: [StoryTray], at index: Int, from sourceID: String, store: AppStore) {
        source = (sourceID, trays[index].author.id)
        pendingOpenFrame = frames[sourceID]
        var transaction = Transaction()
        transaction.disablesAnimations = pendingOpenFrame != nil
        withTransaction(transaction) {
            store.openStories(trays: trays, startIndex: index)
        }
    }

    /// Waits until the first story's picture is downloaded, but only for a moment.
    private func preloadFirstPicture(of tray: StoryTray) async {
        let first = tray.stories.first { !$0.seen } ?? tray.stories.first
        guard let url = API.mediaURL(first?.media.thumbnail) else { return }
        let limit = Self.maximumSpin
        await withTaskGroup(of: Void.self) { group in
            group.addTask { _ = try? await ImageLoader.shared.image(for: url) }
            group.addTask { try? await Task.sleep(for: .seconds(limit)) }
            await group.next() // whichever finishes first
            group.cancelAll()
        }
    }
}

extension View {
    /// Reports where this avatar is on screen, so the story viewer can grow out of it and shrink
    /// back into it. AvatarView adds it for you when you give it a `storyZoomID`.
    func storyZoomSource(id: String?) -> some View {
        modifier(StoryZoomSource(id: id))
    }
}

private struct StoryZoomSource: ViewModifier {
    let id: String?

    func body(content: Content) -> some View {
        if let id {
            content
                .onGeometryChange(for: CGRect.self) { proxy in
                    proxy.frame(in: .global)
                } action: { frame in
                    StoryZoom.shared.setFrame(frame, for: id)
                }
                .onDisappear { StoryZoom.shared.removeFrame(for: id) }
        } else {
            content
        }
    }
}
