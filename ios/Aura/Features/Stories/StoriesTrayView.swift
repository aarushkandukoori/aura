import SwiftUI

/// The stories row at the top of Home: "Your story" (with a + to add one), then everyone else,
/// unwatched stories first. Tapping a face spins its ring while the story loads, then the viewer
/// grows out of that face (StoryZoom).
///
/// Like Instagram, the row keeps its order while you watch: a face you've just watched turns gray
/// where it is instead of jumping to the end, so closing the viewer can shrink back into it.
/// Pull to refresh sorts the row again (`sortToken`).
struct StoriesTrayView: View {
    @Environment(AppStore.self) private var store
    /// Changes when Home is refreshed: the row sorts itself again, watched faces last.
    var sortToken = 0

    @State private var showsComposer = false
    /// The faces in the order they're shown (author ids).
    @State private var order: [String] = []

    var body: some View {
        let trays = otherTrays
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(alignment: .top, spacing: 14) {
                    yourStory
                        .id(myId)
                    ForEach(Array(trays.enumerated()), id: \.element.author.id) { index, tray in
                        trayItem(tray, in: trays, index: index)
                            .id(tray.author.id)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.top, 8)
                .padding(.bottom, 12)
            }
            .onChange(of: StoryZoom.shared.currentAuthorId) { _, authorId in
                // While the viewer is open, keep the face of whoever's story is showing in view, so
                // closing the viewer shrinks the story right back into that face.
                guard let authorId, store.storyViewer != nil else { return }
                proxy.scrollTo(authorId, anchor: .center)
            }
        }
        .onChange(of: trays.map(\.author.id), initial: true) { _, ids in order = ids }
        .onChange(of: sortToken) { order = [] }
        .fullScreenCover(isPresented: $showsComposer) {
            StoryComposerView()
                .environment(store)
        }
    }

    private var myId: String { store.me?.id ?? "me" }

    /// Everyone else's stories in the order they're shown: the faces already in the row keep their
    /// places; new ones go first if unwatched (where new stories belong) or last if watched.
    private var otherTrays: [StoryTray] {
        let trays = store.storyTrays.filter { !$0.author.isMe }
        var byAuthor: [String: StoryTray] = [:]
        for tray in trays { byAuthor[tray.author.id] = tray }
        let kept = order.compactMap { byAuthor[$0] }
        let fresh = trays.filter { !order.contains($0.author.id) }
        return fresh.filter { !$0.allSeen } + kept + fresh.filter(\.allSeen)
    }

    // MARK: - Items

    private var yourStory: some View {
        let myTray = store.myTray
        let zoomID = StoryZoom.trayID(myId)
        return VStack(spacing: 6) {
            AvatarView(path: store.me?.avatar, size: 78, ring: myTray.map { $0.allSeen ? .seen : .unseen } ?? .none,
                       storyZoomID: zoomID) {
                if let myTray {
                    Task { await StoryZoom.shared.open([myTray], at: 0, from: zoomID, store: store) }
                } else {
                    showsComposer = true
                }
            }
            .overlay(alignment: .bottomTrailing) {
                Button { showsComposer = true } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 12, weight: .heavy))
                        .foregroundStyle(.white)
                        .frame(width: 24, height: 24)
                        .background(Circle().fill(Theme.accent))
                        .overlay(Circle().stroke(Theme.background, lineWidth: 3))
                }
                .buttonStyle(.plain)
                .offset(x: 2, y: 2)
                .accessibilityLabel("Add to your story")
            }
            label("Your story", dimmed: myTray == nil)
        }
    }

    private func trayItem(_ tray: StoryTray, in trays: [StoryTray], index: Int) -> some View {
        let zoomID = StoryZoom.trayID(tray.author.id)
        return VStack(spacing: 6) {
            AvatarView(path: store.latest(tray.author).avatar, size: 78, ring: tray.allSeen ? .seen : .unseen,
                       storyZoomID: zoomID) {
                Task { await StoryZoom.shared.open(trays, at: index, from: zoomID, store: store) }
            }
            label(tray.author.username, dimmed: false)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(tray.author.username)'s story\(tray.allSeen ? "" : ", new")")
        .accessibilityAddTraits(.isButton)
    }

    private func label(_ text: String, dimmed: Bool) -> some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(dimmed ? Theme.muted : Theme.text)
            .lineLimit(1)
            .frame(width: 80)
    }
}
