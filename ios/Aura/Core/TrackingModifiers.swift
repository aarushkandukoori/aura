import SwiftUI

// View modifiers that time how long things are on screen and report it to Tracker.swift.
//
//     PostCellView(post: post).tracksImpression(of: post.id)
//     ReelPage(...).tracksReelWatch(of: post.id, isActive: isActive, lengthSeconds: length)
//     StoryPage's picture.tracksStoryWatch(of: story, isActive: isActive)
//
// The clocks only run while the app is open (scenePhase is .active).

extension View {
    /// Each stretch of time this post spends at least half on screen, if 1 second or longer, becomes
    /// an impression with its duration.
    func tracksImpression(of postId: String) -> some View {
        modifier(ImpressionTracking(postId: postId))
    }

    /// Time spent on a reel while it's the one playing, sent when the person moves on. `lengthSeconds`
    /// is one play's length (nil until a video knows it); watching that long counts as complete.
    func tracksReelWatch(of postId: String, isActive: Bool, lengthSeconds: Double?) -> some View {
        modifier(ReelWatchTracking(postId: postId, isActive: isActive, lengthSeconds: lengthSeconds))
    }

    /// Time on each of someone else's stories: leaving within 1.5 s is a skip, longer is a view.
    func tracksStoryWatch(of story: Story, isActive: Bool) -> some View {
        modifier(StoryWatchTracking(story: story, isActive: isActive))
    }
}

/// Shorter than this isn't a real look at a post.
private let minimumImpressionMs = 1000
/// Leaving a story sooner than this is a skip.
private let storySkipMs = 1500

// MARK: - Posts

private struct ImpressionTracking: ViewModifier {
    @Environment(AppStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase
    let postId: String

    /// At least half of the post is inside its scroll view.
    @State private var isHalfVisible = false
    /// The screen is showing (false once another screen is pushed on top or another tab is picked).
    @State private var isShown = false
    @State private var time = ScreenTime()

    func body(content: Content) -> some View {
        content
            .onScrollVisibilityChange(threshold: 0.5) { visible in
                isHalfVisible = visible
                update()
            }
            .onAppear {
                isShown = true
                update()
            }
            .onDisappear {
                isShown = false
                update()
            }
            .onChange(of: scenePhase) { update() }
            .onChange(of: store.storyViewer == nil) { update() } // stories cover the whole screen
    }

    private var isOnScreen: Bool {
        isHalfVisible && isShown && scenePhase == .active && store.storyViewer == nil
    }

    private func update() {
        if isOnScreen {
            time.start()
        } else if time.isRunning {
            let ms = time.take()
            if ms >= minimumImpressionMs {
                Tracker.shared.track(TrackEvent(type: .impression, postId: postId, ms: ms))
            }
        }
    }
}

// MARK: - Reels

private struct ReelWatchTracking: ViewModifier {
    @Environment(\.scenePhase) private var scenePhase
    let postId: String
    let isActive: Bool
    let lengthSeconds: Double?

    @State private var time = ScreenTime()

    func body(content: Content) -> some View {
        content
            .onChange(of: isActive, initial: true) { update() }
            .onChange(of: scenePhase) { update() }
            .onDisappear { send() }
    }

    private func update() {
        if isActive && scenePhase == .active {
            time.start()
        } else {
            send() // swiped on, left the screen, or the app went to the background
        }
    }

    private func send() {
        let ms = time.take()
        guard ms >= 300 else { return } // swiping straight past isn't watching
        let complete = lengthSeconds.map { Double(ms) >= $0 * 1000 } ?? false
        Tracker.shared.track(TrackEvent(type: .reelWatch, postId: postId, ms: ms, complete: complete))
    }
}

// MARK: - Stories

private struct StoryWatchTracking: ViewModifier {
    @Environment(\.scenePhase) private var scenePhase
    let story: Story
    let isActive: Bool

    /// The story being timed (the one on screen until the person moves on).
    @State private var watching: Story?
    @State private var time = ScreenTime()

    func body(content: Content) -> some View {
        content
            .onAppear { update() }
            .onChange(of: story.id) { update() }
            .onChange(of: isActive) { update() }
            .onChange(of: scenePhase) { update() }
            .onDisappear { finish() }
    }

    private func update() {
        // My own stories don't teach the algorithm anything.
        let shouldWatch = isActive && !story.author.isMe
        if let watching, watching.id != story.id || !shouldWatch { finish() }
        guard shouldWatch else { return }
        if watching == nil { watching = story }
        // In the background the clock pauses; the story is still the one being watched.
        if scenePhase == .active { time.start() } else { time.stop() }
    }

    private func finish() {
        guard let watched = watching else { return }
        watching = nil
        let ms = time.take()
        guard ms >= 100 else { return } // a quick redraw, not a real look
        let event = ms < storySkipMs
            ? TrackEvent(type: .storySkip, accountId: watched.author.id, storyId: watched.id)
            : TrackEvent(type: .storyView, accountId: watched.author.id, storyId: watched.id, ms: ms)
        Tracker.shared.track(event)
    }
}
