import SwiftUI

/// One person's stories inside the viewer: the picture with its text, the progress bars, the
/// header, and the bottom bar ("Send message" for other people, "Seen by" on my own stories).
///
/// Each story plays for 5 seconds. Tap the left side to go back, the right side to go forward,
/// and hold anywhere to pause (the bars hide while you hold).
struct StoryPage: View {
    @Environment(AppStore.self) private var store
    let tray: StoryTray
    /// Only the page on screen plays.
    let isActive: Bool
    /// The viewer wants the story to hold still (dragging it down, typing a reply, the viewers sheet).
    let isPausedByViewer: Bool
    /// A reply is being typed over this story: its text and bottom bar step aside for the reply box.
    let isReplying: Bool
    let hasPreviousTray: Bool
    var onNextTray: () -> Void
    var onPreviousTray: () -> Void
    var onReply: (Story) -> Void
    var onReact: (String, Story) -> Void
    var onShowViewers: (Story) -> Void

    static let storyDuration = 5.0

    @State private var stories: [Story]
    @State private var index: Int
    @State private var progress = 0.0
    @State private var isPressing = false
    @State private var isHolding = false
    @State private var holdEndedAt: Date?
    @State private var pausedByViewer = false
    @State private var confirmingDelete = false
    @State private var viewerAvatars: [String?] = []

    init(tray: StoryTray, isActive: Bool, isPausedByViewer: Bool, isReplying: Bool, hasPreviousTray: Bool,
         onNextTray: @escaping () -> Void, onPreviousTray: @escaping () -> Void,
         onReply: @escaping (Story) -> Void, onReact: @escaping (String, Story) -> Void,
         onShowViewers: @escaping (Story) -> Void) {
        self.tray = tray
        self.isActive = isActive
        self.isPausedByViewer = isPausedByViewer
        self.isReplying = isReplying
        self.hasPreviousTray = hasPreviousTray
        self.onNextTray = onNextTray
        self.onPreviousTray = onPreviousTray
        self.onReply = onReply
        self.onReact = onReact
        self.onShowViewers = onShowViewers
        _stories = State(initialValue: tray.stories)
        // Pick up where I left off: the first story I haven't seen yet.
        _index = State(initialValue: tray.stories.firstIndex { !$0.seen } ?? 0)
    }

    var body: some View {
        if stories.isEmpty {
            Color.clear
        } else {
            page
        }
    }

    private var story: Story { stories[min(index, stories.count - 1)] }
    private var isMine: Bool { tray.author.isMe }

    /// Read by the playback loop on every tick (they're all @State, so the loop always sees the latest).
    private var isPaused: Bool { isPressing || pausedByViewer || confirmingDelete }

    private var page: some View {
        VStack(spacing: 8) {
            canvas
            bottomBar
                .frame(height: 46)
                .padding(.horizontal, 12)
                .opacity(isReplying ? 0 : 1)
        }
        .padding(.bottom, 4)
        .task(id: "\(story.id)|\(isActive)") { await play() }
        .task(id: "\(story.id)|\(liveViewCount)|\(isActive)") { await loadViewerAvatars() }
        .onChange(of: isPausedByViewer, initial: true) { _, paused in pausedByViewer = paused }
        .confirmationDialog("Delete this story?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { deleteStory() }
        }
    }

    // MARK: - The picture

    private var canvas: some View {
        GeometryReader { geometry in
            ZStack {
                RemoteImage(path: story.media.thumbnail)
                if let overlay = story.overlay, let text = overlay.text, !text.isEmpty {
                    StoryOverlayLabel(overlay: overlay, maxWidth: geometry.size.width * 0.84)
                        .position(x: geometry.size.width / 2, y: geometry.size.height * (overlay.y ?? 0.5))
                        .opacity(isReplying ? 0 : 1)
                }
                // A soft shade at the top so the white bars and name read on bright photos.
                LinearGradient(colors: [.black.opacity(0.45), .clear], startPoint: .top, endPoint: UnitPoint(x: 0.5, y: 0.2))
                    .allowsHitTesting(false)
                tapArea(width: geometry.size.width)
                VStack(spacing: 10) {
                    StoryProgressBars(count: stories.count, index: index, progress: progress)
                    header
                }
                .padding(.horizontal, 10)
                .padding(.top, 10)
                .frame(maxHeight: .infinity, alignment: .top)
                .opacity(isHolding ? 0 : 1)
                .animation(.easeOut(duration: 0.2), value: isHolding)
            }
        }
        .aspectRatio(9 / 16, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func tapArea(width: CGFloat) -> some View {
        Color.clear
            .contentShape(Rectangle())
            .onTapGesture { location in
                // Letting go after a hold isn't a tap.
                if let holdEndedAt, Date.now.timeIntervalSince(holdEndedAt) < 0.4 { return }
                if location.x < width * 0.3 { goBack() } else { goForward() }
            }
            .onLongPressGesture(minimumDuration: 0.2, maximumDistance: 30) {
                isHolding = true
            } onPressingChanged: { pressing in
                isPressing = pressing
                if !pressing && isHolding {
                    isHolding = false
                    holdEndedAt = .now
                }
            }
    }

    private var header: some View {
        HStack(spacing: 8) {
            Button { store.navigate(to: .profile(tray.author.username)) } label: {
                HStack(spacing: 8) {
                    AvatarView(path: tray.author.avatar, size: 32)
                    Text(tray.author.username)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    if tray.author.verified { VerifiedBadge(size: 12) }
                    Text(Format.timeAgo(story.createdAt))
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.75))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Spacer()
            if isMine {
                Button { confirmingDelete = true } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 18, weight: .semibold))
                        .frame(width: 36, height: 36)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Story options")
            }
            Button { store.closeStories() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 20, weight: .semibold))
                    .frame(width: 36, height: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close")
        }
        .foregroundStyle(.white)
        .shadow(color: .black.opacity(0.3), radius: 3)
    }

    // MARK: - Bottom bar

    @ViewBuilder private var bottomBar: some View {
        if isMine {
            Button { onShowViewers(story) } label: {
                HStack(spacing: 8) {
                    if viewerAvatars.isEmpty {
                        Image(systemName: "eye")
                    } else {
                        StackedAvatars(paths: viewerAvatars, size: 26)
                    }
                    Text(liveViewCount > 0 ? "Seen by \(Format.count(liveViewCount))" : "No views yet")
                        .contentTransition(.numericText(value: Double(liveViewCount)))
                        .animation(.snappy, value: liveViewCount)
                    Spacer()
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        } else {
            HStack(spacing: 14) {
                // Looks like a text field; the real one opens over the story (StoryReplyOverlay).
                Button { onReply(story) } label: {
                    Text("Send message")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.85))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 18)
                        .frame(height: 44)
                        .overlay(Capsule().strokeBorder(.white.opacity(0.6), lineWidth: 1))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                Button { onReact("❤️", story) } label: {
                    Image(systemName: "heart")
                        .font(.system(size: 24))
                        .foregroundStyle(.white)
                        .frame(width: 36, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Like story")
            }
        }
    }

    // MARK: - Playing

    /// Plays the current story: waits for its picture, marks it seen, then fills the bar over
    /// 5 seconds (standing still while paused) and moves on.
    private func play() async {
        guard isActive, !stories.isEmpty else { return }
        progress = 0
        let current = story
        // Wait for the picture (a moment at most), so the 5 seconds start when it can be seen.
        if let url = API.mediaURL(current.media.thumbnail) {
            _ = try? await ImageLoader.shared.image(for: url)
        }
        guard !Task.isCancelled else { return }
        store.markStorySeen(current)
        preloadNextPicture()
        let tick = 1.0 / 30
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(tick))
            if Task.isCancelled || isPaused { continue }
            progress = min(1, progress + tick / Self.storyDuration)
            if progress >= 1 {
                goForward()
                return
            }
        }
    }

    private func goForward() {
        if index < stories.count - 1 {
            index += 1
        } else {
            onNextTray()
        }
    }

    private func goBack() {
        if index > 0 {
            index -= 1
        } else if hasPreviousTray {
            onPreviousTray()
        } else {
            progress = 0 // the very first story: start it over
        }
    }

    private func preloadNextPicture() {
        guard index + 1 < stories.count, let url = API.mediaURL(stories[index + 1].media.thumbnail) else { return }
        Task { _ = try? await ImageLoader.shared.image(for: url) }
    }

    // MARK: - My own stories

    /// The view count, kept live by `story.views` events in the store.
    private var liveViewCount: Int {
        store.myTray?.stories.first { $0.id == story.id }?.viewCount ?? story.viewCount
    }

    /// The faces of the latest viewers for the "Seen by" bar (reloaded as views come in).
    private func loadViewerAvatars() async {
        guard isMine, isActive, !stories.isEmpty else { return }
        if let response = try? await API.storyViewers(story.id) {
            viewerAvatars = response.viewers.prefix(3).map(\.account.avatar)
        }
    }

    private func deleteStory() {
        let doomed = story
        Task {
            do {
                try await store.deleteStory(doomed)
                Haptics.tap()
                stories.removeAll { $0.id == doomed.id }
                if stories.isEmpty {
                    onNextTray()
                } else {
                    index = min(index, stories.count - 1)
                }
            } catch {
                if !error.isCancellation { Haptics.error() }
            }
        }
    }
}
