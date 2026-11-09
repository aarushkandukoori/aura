import UIKit

/// Tells the recommendation algorithm (server/recs) what the person looks at, so their feed, Explore
/// and Reels fill up with what they enjoy. Likes, comments, follows and shares the server already
/// learns from their own requests; these are the quiet signals only the app can see:
///
///     .tracksImpression(of: post.id)               a post at least half on screen for 1 s or more
///     Tracker.shared.open(postId)                  opened a post's page or its comments
///     .tracksReelWatch(of: id, isActive:, ...)     time on a reel, and whether it played to the end
///     .tracksStoryWatch(of: story, isActive:)      a story watched, or skipped within 1.5 s
///     Tracker.shared.profileView(accountId)        opened someone's profile
///     Tracker.shared.search(query)                 searched for something
///     Tracker.shared.tagOpen(tag)                  opened a hashtag page
///
/// The view modifiers that time things on screen are in TrackingModifiers.swift. Events wait in a
/// queue and go out together every 10 seconds, and right away when the app goes to the background.
@MainActor
final class Tracker {
    static let shared = Tracker()

    /// How long events wait before going out together.
    static let sendDelay: Duration = .seconds(10)
    /// Events per request (the server takes up to 200).
    static let batchSize = 100

    private var queue: [TrackEvent] = []
    /// Waiting to send the queue (nil when nothing is scheduled).
    private var timer: Task<Void, Never>?
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid
    private var lastSearch = ""

    // MARK: - Things to report

    /// Adds one event to the queue; it goes out within 10 seconds.
    func track(_ event: TrackEvent) {
        queue.append(event)
        if queue.count >= Self.batchSize {
            Task { await send() }
        } else if timer == nil {
            timer = Task {
                try? await Task.sleep(for: Self.sendDelay)
                timer = nil
                await send()
            }
        }
    }

    /// Opened a post's page or its comments.
    func open(_ postId: String) {
        track(TrackEvent(type: .open, postId: postId))
    }

    /// Opened someone else's profile.
    func profileView(_ accountId: String) {
        track(TrackEvent(type: .profileView, accountId: accountId))
    }

    /// Searched (call it when results for a settled search arrive). The same words twice count once.
    func search(_ query: String) {
        let words = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard words.count >= 2, words != lastSearch else { return }
        lastSearch = words
        track(TrackEvent(type: .search, query: words))
    }

    /// Opened a hashtag page (the tag without "#").
    func tagOpen(_ tag: String) {
        track(TrackEvent(type: .tagOpen, tag: tag))
    }

    // MARK: - Sending

    /// Sends everything waiting now. A lost batch only makes the feed a little less personal, so
    /// failures are ignored.
    func send() async {
        let events = queue
        queue = []
        for start in stride(from: 0, to: events.count, by: Self.batchSize) {
            let batch = Array(events[start..<min(start + Self.batchSize, events.count)])
            try? await API.track(batch)
        }
    }

    /// The app is going to the background: send now, asking iOS for a few seconds to finish.
    func sendBeforeSuspending() {
        guard backgroundTask == .invalid else { return }
        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "Send what was seen") { [weak self] in
            self?.endBackgroundTask() // out of time: iOS wants the app to stop now
        }
        Task {
            // Screens stop their on-screen clocks on the same change; this lets their events join the batch.
            try? await Task.sleep(for: .milliseconds(300))
            await send()
            endBackgroundTask()
        }
    }

    /// Drops what's waiting (after signing out or starting over: it belongs to a world that's gone).
    func discard() {
        queue = []
        lastSearch = ""
    }

    private func endBackgroundTask() {
        guard backgroundTask != .invalid else { return }
        UIApplication.shared.endBackgroundTask(backgroundTask)
        backgroundTask = .invalid
    }
}

/// Adds up how long something is on screen. start() and stop() can be called any number of times;
/// take() returns the total in milliseconds and starts over.
struct ScreenTime {
    private var total: TimeInterval = 0
    private var since: Date?

    var isRunning: Bool { since != nil }

    mutating func start() {
        if since == nil { since = Date() }
    }

    mutating func stop() {
        if let since { total += Date().timeIntervalSince(since) }
        since = nil
    }

    mutating func take() -> Int {
        stop()
        defer { total = 0 }
        return Int((total * 1000).rounded())
    }
}
