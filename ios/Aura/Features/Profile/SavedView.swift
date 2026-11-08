import SwiftUI

/// The posts I saved, as a grid. Only I can see it.
struct SavedView: View {
    @Environment(AppStore.self) private var store
    @State private var pager = PostPager { cursor in try await API.saved(cursor: cursor) }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                Label("Only you can see what you've saved", systemImage: "lock")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
                    .padding(.vertical, 12)
                content
            }
        }
        .refreshable { await pager.reload(into: store) }
        .navigationTitle("Saved")
        .navigationBarTitleDisplayMode(.inline)
        // Saves happen on other screens, so refresh every time this screen shows.
        .task { await pager.reload(into: store) }
    }

    @ViewBuilder private var content: some View {
        // Unsaving a post somewhere else hides it here right away.
        let posts = pager.posts(in: store).filter(\.savedByMe)
        if !pager.hasLoaded {
            if let error = pager.errorMessage {
                EmptyStateView(systemImage: "wifi.slash", title: "Couldn't load saved posts", message: error,
                               actionTitle: "Try again") { Task { await pager.reload(into: store) } }
            } else {
                GridSkeleton(rows: 4)
            }
        } else if posts.isEmpty {
            EmptyStateView(systemImage: "bookmark", title: "Save what you love",
                           message: "Tap the bookmark on any post to keep it here.")
        } else {
            PostGrid(posts: posts, onLastAppear: { Task { await pager.loadMore(into: store) } })
        }
    }
}
