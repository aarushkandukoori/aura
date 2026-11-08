import SwiftUI

/// Who watched my story (named viewers, newest first) and how they reacted. Reloads by itself as
/// new views come in.
struct StoryViewersSheet: View {
    @Environment(AppStore.self) private var store
    let story: Story

    @State private var response: ViewersResponse?
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if let response {
                        let total = max(response.total, liveViewCount)
                        if total > 0 {
                            summary(total: total)
                        }
                        if response.viewers.isEmpty {
                            EmptyStateView(systemImage: "eye", title: "No viewers yet",
                                           message: "When people watch your story, you'll see them here.")
                        }
                        ForEach(response.viewers, id: \.account.id) { viewer in
                            UserRow(account: viewer.account, subtitle: viewer.account.displayName, avatarSize: 44) {
                                if let reaction = viewer.reaction {
                                    Text(reaction).font(.title2)
                                }
                            }
                        }
                    } else if let errorMessage {
                        EmptyStateView(systemImage: "wifi.slash", title: "Couldn't load viewers", message: errorMessage)
                    } else {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding(.top, 48)
                    }
                }
                .padding(.bottom, 20)
            }
            .navigationTitle("Viewers")
            .navigationBarTitleDisplayMode(.inline)
            .background(Theme.background)
            .withAuraRoutes()
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Theme.background)
        .task(id: liveViewCount) { await load() }
    }

    private func summary(total: Int) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "eye")
            Text(Format.count(total, "view"))
                .contentTransition(.numericText(value: Double(total)))
                .animation(.snappy, value: total)
        }
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(Theme.text)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    /// Kept live by `story.views` events in the store.
    private var liveViewCount: Int {
        store.myTray?.stories.first { $0.id == story.id }?.viewCount ?? story.viewCount
    }

    private func load() async {
        do {
            response = try await API.storyViewers(story.id)
            errorMessage = nil
        } catch {
            if !error.isCancellation { errorMessage = error.localizedDescription }
        }
    }
}
