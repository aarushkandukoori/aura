import SwiftUI

/// The Explore tab: a search bar (opens Search), topic chips (For you + my interests) and an endless
/// mosaic of posts from people I may not follow yet.
struct ExploreView: View {
    @Environment(AppStore.self) private var store
    /// nil = For you.
    @State private var topic: String?
    @State private var pager = ExploreView.pager(for: nil)

    private static func pager(for topic: String?) -> PostPager {
        PostPager { cursor in try await API.explore(cursor: cursor, topic: topic) }
    }

    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(spacing: 0) {
                    topicChips
                    grid(width: geometry.size.width)
                }
            }
            .refreshable { await pager.reload(into: store) }
        }
        .safeAreaInset(edge: .top, spacing: 0) { searchBar }
        .toolbar(.hidden, for: .navigationBar)
        .task(id: topic) { await pager.loadFirstPage(into: store) }
    }

    // MARK: - Search bar and topics

    private var searchBar: some View {
        NavigationLink(value: Route.search) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 16, weight: .semibold))
                Text("Search")
                Spacer()
            }
            .font(.body)
            .foregroundStyle(Theme.muted)
            .padding(.horizontal, 14)
            .frame(height: 40)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 12)
        .padding(.top, 6)
        .padding(.bottom, 8)
        .background(Theme.background.ignoresSafeArea(edges: .top))
        .accessibilityLabel("Search")
    }

    private var topicChips: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                topicChip(nil, title: "✨ For you")
                ForEach(store.me?.interests ?? [], id: \.self) { interest in
                    topicChip(interest, title: InterestCatalog.label(interest))
                }
            }
            .padding(.horizontal, 12)
        }
        .scrollIndicators(.hidden)
        .padding(.bottom, 10)
    }

    private func topicChip(_ value: String?, title: String) -> some View {
        Button {
            guard value != topic else { return }
            Haptics.selection()
            topic = value
            pager = Self.pager(for: value) // the new pager loads in .task(id: topic)
        } label: {
            ChipLabel(title: title, isSelected: topic == value, height: 34)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Grid

    @ViewBuilder private func grid(width: CGFloat) -> some View {
        let posts = pager.posts(in: store)
        if !pager.hasLoaded {
            if let error = pager.errorMessage {
                EmptyStateView(systemImage: "wifi.slash", title: "Couldn't load Explore", message: error,
                               actionTitle: "Try again") { Task { await pager.reload(into: store) } }
            } else {
                GridSkeleton(rows: 5)
            }
        } else if posts.isEmpty {
            EmptyStateView(systemImage: "sparkles", title: "Nothing here yet",
                           message: topic == nil ? "Check back in a little while." : "Try another topic.")
        } else {
            ExploreMosaic(posts: posts, width: width) {
                Task { await pager.loadMore(into: store) }
            }
            if pager.isLoading {
                ProgressView().padding(24)
            }
        }
    }
}
