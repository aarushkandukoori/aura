import SwiftUI

/// Full-screen reels, one per page, swiped up and down. `startId` = the reel to show first (nil on
/// the Reels tab). Only the reel on screen plays, and only while this screen is showing.
struct ReelsView: View {
    @Environment(AppStore.self) private var store
    let startId: String?

    @State private var pager: PostPager
    /// The reel on screen (the scroll view keeps it in sync as you swipe).
    @State private var currentId: String?
    @State private var isOnScreen = false
    /// Sound is off until you tap a video, then stays on for the next ones (like other reel apps).
    @State private var isMuted = true
    /// Reels already counted as viewed during this visit.
    @State private var viewedIds: Set<String> = []

    init(startId: String?) {
        self.startId = startId
        _pager = State(initialValue: PostPager { cursor in try await API.reels(cursor: cursor, start: startId) })
    }

    var body: some View {
        // The reader stays inside the safe area so it can report the bars' sizes; the reels
        // themselves fill the whole screen and use those sizes to keep text clear of the bars.
        GeometryReader { geometry in
            ZStack {
                Color.black
                content(insets: geometry.safeAreaInsets)
            }
            // Reels are always dark, so pictures that are still loading get dark placeholders too.
            .environment(\.colorScheme, .dark)
            .ignoresSafeArea()
        }
        .navigationTitle(startId == nil ? "Reels" : "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if startId == nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { store.show([], in: .create) } label: {
                        Image(systemName: "camera")
                    }
                    .tint(.white)
                    .accessibilityLabel("Create a reel")
                }
            }
        }
        // Light bars over the dark video, wherever this screen is shown. The tab bar only while
        // reels are on screen: a screen pushed on top would otherwise keep the dark tab bar too.
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .toolbarColorScheme(isOnScreen ? .dark : nil, for: .tabBar)
        .onAppear { isOnScreen = true }
        .onDisappear { isOnScreen = false }
        .task {
            await pager.loadFirstPage(into: store)
            if currentId == nil { currentId = pager.ids.first }
        }
        .onChange(of: currentId) { loadMoreIfNeeded() }
    }

    @ViewBuilder private func content(insets: EdgeInsets) -> some View {
        let reels = pager.posts(in: store)
        if !pager.hasLoaded {
            if let error = pager.errorMessage {
                message(icon: "wifi.slash", title: "Couldn't load reels", detail: error, retry: true)
            } else {
                ProgressView().tint(.white)
            }
        } else if reels.isEmpty {
            message(icon: "play.rectangle", title: "No reels yet", detail: "Short videos from your friends show up here.", retry: false)
        } else {
            ScrollView(.vertical) {
                LazyVStack(spacing: 0) {
                    ForEach(reels) { post in
                        ReelPage(post: post, isActive: isPlaying(post), insets: insets,
                                 isMuted: $isMuted) { countView(of: post.id) }
                            .containerRelativeFrame([.horizontal, .vertical])
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollIndicators(.hidden)
            .scrollPosition(id: $currentId)
            .ignoresSafeArea()
        }
    }

    private func message(icon: String, title: String, detail: String, retry: Bool) -> some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 40, weight: .light))
            Text(title)
                .font(.title3.weight(.bold))
            Text(detail)
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.7))
                .multilineTextAlignment(.center)
            if retry {
                Button("Try again") { Task { await pager.reload(into: store) } }
                    .buttonStyle(.auraPrimary)
                    .padding(.top, 6)
            }
        }
        .foregroundStyle(.white)
        .padding(32)
    }

    /// The reel on screen plays, unless this screen is hidden or a story is open on top of it.
    private func isPlaying(_ post: Post) -> Bool {
        isOnScreen && store.storyViewer == nil && currentId == post.id
    }

    /// Counts a view once per visit (ReelPage calls this after two seconds on screen).
    private func countView(of postId: String) {
        if viewedIds.insert(postId).inserted { store.recordView(postId) }
    }

    /// Loads the next page when you're three reels from the end.
    private func loadMoreIfNeeded() {
        guard let currentId, let index = pager.ids.firstIndex(of: currentId), index >= pager.ids.count - 3 else { return }
        Task { await pager.loadMore(into: store) }
    }
}
