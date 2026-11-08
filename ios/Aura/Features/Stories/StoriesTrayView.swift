import SwiftUI

/// The stories row at the top of Home: "Your story" (with a + to add one), then everyone else,
/// unwatched stories first. Tapping a face opens the full-screen viewer.
struct StoriesTrayView: View {
    @Environment(AppStore.self) private var store
    @State private var showsComposer = false

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(alignment: .top, spacing: 14) {
                yourStory
                ForEach(Array(otherTrays.enumerated()), id: \.element.id) { index, tray in
                    trayItem(tray, index: index)
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 12)
        }
        .fullScreenCover(isPresented: $showsComposer) {
            StoryComposerView()
                .environment(store)
        }
    }

    /// Everyone else's stories: unwatched first, then watched, each group in the server's order.
    private var otherTrays: [StoryTray] {
        let trays = store.storyTrays.filter { !$0.author.isMe }
        return trays.filter { !$0.allSeen } + trays.filter(\.allSeen)
    }

    // MARK: - Items

    private var yourStory: some View {
        let myTray = store.myTray
        return VStack(spacing: 6) {
            AvatarView(path: store.me?.avatar, size: 78, ring: myTray.map { $0.allSeen ? .seen : .unseen } ?? .none) {
                if let myTray {
                    store.openStories(trays: [myTray])
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

    private func trayItem(_ tray: StoryTray, index: Int) -> some View {
        VStack(spacing: 6) {
            AvatarView(path: store.latest(tray.author).avatar, size: 78, ring: tray.allSeen ? .seen : .unseen) {
                store.openStories(trays: otherTrays, startIndex: index)
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
